# Transcript Insights

An AI service that turns meeting audio — or raw transcript text — into structured insights: decisions made, action items with owners, risks and blockers, and user needs backed by source quotes.

Stateless and privacy-safe by design. Nothing is stored.

---

## Why I built this

Meetings are where decisions get made and immediately lost. This started as a working prototype exploring what structured AI extraction could look like as a standalone tool or an embedded product feature — the full pipeline from audio ingestion through prompt engineering to eval-driven output validation.

v2 adds dynamic, per-request extraction schemas: the caller defines the categories and fields they want, and the system prompt and JSON output shape adapt automatically. The default schema extracts PM-focused categories; any schema can be passed in.

**Built to learn and demonstrate:**
- Audio-to-text pipeline (Whisper)
- Structured JSON extraction from unstructured language (Claude)
- Prompt engineering for consistent, non-hallucinated output
- Caller-defined schemas without changing the service
- Eval-harness design for AI output quality

---

## From v1 to v2

v1 proved the concept, but it was locked to a single use case. Three limitations drove the rewrite:

**One rigid schema.** v1 only extracted a fixed PM shape — decisions, action items, risks, user needs. Any other use (a sales debrief, a bookkeeping call, a research interview) meant forking the prompt. v2 makes the schema a per-request input, so one service handles many extraction jobs. This is what let StrikeCRM be built on top of the engine rather than rebuilt from scratch.

**Brittle output.** The model would occasionally wrap its JSON in markdown fences and break the parse, and v1's attribution rules were loose enough to produce guessed owners and misattributed risks. v2 adds a defensive JSON pre-parser and tightens the rules — `"Unassigned"` is reserved for action-item owners, and an unknown risk-raiser is explicitly `null`, never invented.

**No guardrails, no regression net.** v1 shipped with a thin eval and little protection. v2 adds API-key auth, CORS allowlisting, rate limiting, and an eval harness (~97% passing) that gates every prompt, model, or schema change — including a dedicated custom-schema regression test.

The through-line: v1 was a demo; v2 is a reusable, eval-gated engine.

---

## What it does

| Capability | Detail |
|---|---|
| Transcribe | Upload audio (up to 25 MB), get a clean transcript back |
| Analyse | Submit transcript text, get structured insights back |
| Process audio end-to-end | Upload audio, get both transcript and insights in one call |
| Dynamic schema | Caller defines extraction categories and fields; output shape matches |
| Health check | Liveness endpoint for monitoring |

Default schema (PM): `decisions`, `action_items`, `risks_and_blockers`, `user_needs`, plus `meeting_type`, `confidence`, and `notes` metadata.

---

## Pipeline


The frontend owns the UI; the backend owns all the intelligence. The two deploy independently.

---

## Frontend

Built in Bolt (React + Vite + Tailwind). Three input modes:

- **Record** — browser microphone via MediaRecorder API. Pulsing red dot while recording; captures `.webm`, which Whisper accepts directly.
- **Upload** — drag-and-drop or file picker for `.mp3`, `.m4a`, `.wav`.
- **Paste** — textarea for an existing transcript.

Record and Upload hit `/process-audio` (Whisper → Claude). Paste hits `/analyse` directly. Same JSON response shape either way — the UI doesn't branch on which path was used.

Output renders as four collapsible sections: key decisions, action items (owner / task / due table), risks & blockers with severity badge, and user needs with source quotes. The audio path also shows a "View transcript" toggle with the raw Whisper output. Each section has a Copy button; "Export all" downloads a `.txt` summary.

---

## API

All endpoints at the root path. All non-`/health` requests require an `x-api-key` header.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok" }` |
| POST | `/transcribe` | `multipart/form-data`, field `audio` (max 25 MB). Returns `{ transcript }` |
| POST | `/analyse` | JSON `{ transcript, schema? }`. Returns structured insights |
| POST | `/process-audio` | `multipart/form-data`, field `audio`. Chains transcribe → analyse |

---

## Extraction rules

The behaviour that keeps output trustworthy:

- **No fabrication** — extract only what is explicitly stated or clearly implied. Never invent owners, decisions, or risks.
- **Every action item has an owner** — if the transcript doesn't name one, the owner is `"Unassigned"`, not a guess.
- **User needs are evidence-backed** — each carries a source quote from the transcript.
- **Confidence is self-reported** — the model rates transcript clarity `high` / `medium` / `low`.
- **Decisions ≠ discussions** — only things actually agreed are decisions; rejected proposals are not.
- **JSON only** — always a parseable object, no prose, no markdown.

---

## Eval harness

`evals/run.js` posts a set of representative transcripts to `/analyse` and runs per-case assertion checks against the output — validating that decisions are grounded, action items aren't fabricated, severity ratings are appropriate, and source quotes are present.

Six meeting archetypes are covered: clean stakeholder review, user interview, messy standup, design review with disagreement, solo voice note, and a B2B sales debrief. A dedicated test (`evals/test-process-audio-schema.js`) covers the `/process-audio` endpoint and confirms that a custom schema fully overrides the default PM categories rather than merging with them.

**Current pass rate: ~97%.** Run it before any prompt or model change.

```bash
node evals/run.js
API_URL=https://your-host CLIENT_API_KEY=... node evals/run.js
```

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 (ESM) |
| Framework | Express 4 |
| Transcription | OpenAI Whisper (whisper-1) |
| Analysis | Anthropic Claude (claude-sonnet-4-6) |
| Uploads | Multer (25 MB cap) |
| Frontend | React + Vite + Tailwind (Bolt) |
| Hosting | Replit Autoscale |

---

## Security

- API-key auth on all non-`/health` requests (`x-api-key`)
- CORS locked to an allowlist of origins
- Rate limiting — 20 requests / 15 min on `/analyse` and `/process-audio`
- Body size capped at 50 KB; file size at 25 MB
- Temp-file cleanup in `finally` on both audio routes — always removed
- API keys live in server secrets only, never in the frontend

---

## Status

Working backend with an eval-gated extraction engine and dynamic per-request schemas. Frontend in progress. Also powers StrikeCRM, a voice-to-data CRM demo built on the v1 engine.

Built as proof of work by Andrew Locke — Technical PM and founder of Sabrulo, an independent AI product & strategy practice.


