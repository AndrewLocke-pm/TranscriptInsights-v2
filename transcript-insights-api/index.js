import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import "dotenv/config";
import { defaultPMSchema } from "../schemas/default-pm.js";

if (!process.env.OPENAI_API_KEY) console.error("MISSING: OPENAI_API_KEY");
if (!process.env.ANTHROPIC_API_KEY) console.error("MISSING: ANTHROPIC_API_KEY");

function extractJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function buildSystemPrompt(schema) {
  const categoryDescriptions = schema.categories
    .map((cat) => `- **${cat.name}**: ${cat.description}`)
    .join("\n");

  const categoryTemplate = schema.categories
    .map((cat) => {
      const fieldLines = cat.fields
        .map((f) => `    { "${f.name}": "${f.type}" }`)
        .join(",\n");
      return `  "${cat.key}": [\n${fieldLines}\n  ]`;
    })
    .join(",\n");

  return `You are a Product Intelligence Analyst. You extract structured insights from meeting transcripts for product managers.

## STAGE 1 — INTERPRET
Read the transcript carefully. Identify the meeting type (stakeholder review, user interview, team standup, design review, etc.) and the main participants if discernible.

## STAGE 2 — REASON
Extract only what is explicitly stated or clearly implied. Do not invent, infer beyond the text, or hallucinate details. For each category, find direct evidence in the transcript.

Categories to extract:
${categoryDescriptions}

## STAGE 3 — VALIDATE
Before formatting, check:
- Every action item has an owner (use "Unassigned" if no owner is identifiable)
- Every risk is a real concern raised, not a generic warning
- For risks_and_blockers, set raised_by to null if no specific person raised the concern — do not use "Unassigned" for raised_by
- User needs are verbatim or near-verbatim from the transcript
- Decisions are things that were actually agreed, not just discussed

## STAGE 4 — FORMAT
Return ONLY a valid JSON object. No preamble, no explanation. No markdown code fences. Raw JSON only.

{
  "meeting_type": "string",
${categoryTemplate},
  "confidence": "high|medium|low",
  "notes": "string or null"
}

CRITICAL: Your entire response must be a single raw JSON object.
No text before it. No text after it. No markdown. No code fences.
Start your response with { and end with }. Nothing else.`;
}

const app = express();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 25 * 1024 * 1024 },
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".webcontainer-api.io") ||
        origin.endsWith(".bolt.new")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);
app.use(express.json({ limit: "50kb" }));

app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.CLIENT_API_KEY) {
    return res.status(401).json({ error: "Unauthorised" });
  }
  next();
});

// GET /health
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// POST /transcribe
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  const mimeType = (req.file.mimetype || "audio/webm").split(";")[0];
  const ext =
    req.file.originalname.split(".").pop() ||
    (mimeType.includes("mp4") ? "mp4" : "webm");
  const newPath = `${req.file.path}.${ext}`;
  fs.renameSync(req.file.path, newPath);

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: "whisper-1",
    });
    res.json({ transcript: transcription.text });
  } catch (err) {
    res.status(500).json({ error: err.message || "Transcription failed" });
  } finally {
    fs.unlink(newPath, () => {});
  }
});

// POST /analyse
app.post("/analyse", limiter, async (req, res) => {
  const { transcript, schema } = req.body;

  if (!transcript || typeof transcript !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid transcript in request body" });
  }

  const activeSchema = schema || defaultPMSchema;
  const systemPrompt = buildSystemPrompt(activeSchema);

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: transcript }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return res
        .status(500)
        .json({ error: "Unexpected response type from Claude" });
    }

    console.log("Claude raw:", content.text);
    const parsed = extractJSON(content.text);
    res.json(parsed);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: "Claude returned invalid JSON" });
    }
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

// POST /process-audio
app.post(
  "/process-audio",
  limiter,
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const mimeType = (req.file.mimetype || "audio/webm").split(";")[0];
    const ext =
      req.file.originalname.split(".").pop() ||
      (mimeType.includes("mp4") ? "mp4" : "webm");
    const newPath = `${req.file.path}.${ext}`;
    fs.renameSync(req.file.path, newPath);

    try {
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(newPath),
        model: "whisper-1",
      });

      const transcript = transcription.text;

      let activeSchema = defaultPMSchema;
      if (req.body.schema) {
        try {
          activeSchema = JSON.parse(req.body.schema);
        } catch (_) {}
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: buildSystemPrompt(activeSchema),
        messages: [{ role: "user", content: transcript }],
      });

      const content = message.content[0];
      if (content.type !== "text") {
        return res
          .status(500)
          .json({ error: "Unexpected response type from Claude" });
      }

      console.log("Claude raw:", content.text);
      const insights = extractJSON(content.text);
      res.json({ transcript, insights });
    } catch (err) {
      if (err instanceof SyntaxError) {
        return res.status(500).json({ error: "Claude returned invalid JSON" });
      }
      res.status(500).json({ error: err.message || "Processing failed" });
    } finally {
      fs.unlink(newPath, () => {});
    }
  },
);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
