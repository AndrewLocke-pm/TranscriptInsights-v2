# System

## Stack

- **Runtime**: Node.js 24, ESM (`"type": "module"`)
- **Framework**: Express 5
- **Uploads**: Multer (disk storage, 25 MB cap)
- **Transcription**: OpenAI Whisper (`whisper-1`)
- **Analysis**: Anthropic Claude (`claude-sonnet-4-6`, `max_tokens: 2000`)
- **Hosting**: Replit Autoscale (external port 80 → local 3001)

## Layout

```
transcript-insights-api/
  index.js          single-file Express app, all routes
  package.json
schemas/
  default-pm.js     default PM extraction schema (decisions, action items, risks, user needs)
src/
  analyser.js       thin client module — wraps /analyse for Vite frontends
evals/
  test-cases.js                    6 transcripts + per-case assertion checks
  run.js                           posts each to /analyse and reports pass/fail
  test-process-audio-schema.js     /process-audio regression + custom-schema check (needs an audio fixture)
  fixtures/                        audio fixtures used by test-process-audio-schema.js
```

No database. No build step.

## Security

| Layer | Implementation |
|---|---|
| API key auth | All non-`/health` requests require `x-api-key: $CLIENT_API_KEY` header. Missing or wrong key → 401 |
| CORS | Multi-origin allowlist from `ALLOWED_ORIGINS` env var (comma-separated). Suffix wildcards: `*.webcontainer-api.io` and `*.bolt.new` always allowed. Non-browser clients (`!origin`) pass through |
| Rate limiting | `express-rate-limit`: 20 requests per 15 minutes, applied to `/analyse` and `/process-audio` |
| Body size | `express.json({ limit: '50kb' })` |
| File size | Multer: 25 MB cap on audio uploads |
| File cleanup | Temp files deleted in `finally` blocks on both audio routes — always cleaned up regardless of success or failure |

## End-to-end flow

### `/transcribe`
1. Client POSTs `multipart/form-data` with field `audio`
2. Multer writes the file to `uploads/` with no extension
3. The file is renamed to include the correct extension (from `originalname` or MIME type) — required because the OpenAI SDK infers content type from the filename
4. File is streamed to Whisper
5. Transcript text returned as `{ transcript: string }`
6. Temp file deleted in `finally`

### `/analyse`
1. Client POSTs JSON `{ transcript: string, schema?: object }`
2. Validate transcript is a non-empty string
3. If `schema` is provided, use it; otherwise fall back to `defaultPMSchema`
4. `buildSystemPrompt(schema)` generates a dynamic system prompt from the schema's categories and fields
5. Send to Claude with the generated prompt and the transcript as the user message
6. Claude returns text — pass through `extractJSON()` to strip any stray markdown fences
7. `JSON.parse` the result and return it

### `/process-audio`
The `/transcribe` and `/analyse` flows chained: transcribe → feed transcript into Claude with `defaultPMSchema` → return `{ transcript, insights }` in one response.

### `/health`
Returns `{ status: "ok" }`. Auth-exempt. Used for liveness checks.

## Key components

### `buildSystemPrompt(schema)`
Replaces the old static `SYSTEM_PROMPT` constant. Accepts a schema object with a `categories` array and dynamically generates:
- STAGE 2 category descriptions (name + description per category)
- STAGE 4 JSON template (key + field names + types per category)

The surrounding prompt structure (INTERPRET → REASON → VALIDATE → FORMAT) is fixed; only the category-specific content is injected.

### `defaultPMSchema` (`schemas/default-pm.js`)
The fallback schema used when no schema is passed to `/analyse`, and always used by `/process-audio`. Defines four categories: `decisions`, `action_items`, `risks_and_blockers`, `user_needs`. When this schema is active, the response shape is identical to the original v1 hardcoded output.

### `extractJSON()`
A defensive pre-parser. Strips leading ` ```json ` or ` ``` ` fences and trailing ` ``` ` before calling `JSON.parse`. Catches the most common deviation when models occasionally wrap responses in markdown despite instructions.

### Multer file extension fix
The OpenAI SDK uses the filename's extension to set the request content type. Multer saves uploads with no extension. The file is renamed to `<path>.<ext>` (derived from upload filename or MIME type) before streaming it to Whisper. Without this, Whisper rejects the upload.

## Default response schema

When `defaultPMSchema` is used (no schema passed, or `/process-audio`):

```json
{
  "meeting_type": "string",
  "decisions": [
    { "decision": "string", "context": "string" }
  ],
  "action_items": [
    { "owner": "string", "task": "string", "due": "string | null" }
  ],
  "risks_and_blockers": [
    { "risk": "string", "raised_by": "string | null", "severity": "high|medium|low" }
  ],
  "user_needs": [
    { "need": "string", "source_quote": "string" }
  ],
  "confidence": "high|medium|low",
  "notes": "string | null"
}
```

When a custom schema is passed, the keys and field names match whatever the schema defines. `meeting_type`, `confidence`, and `notes` are always present as top-level metadata fields.

## Error handling

| Condition | Status | Response |
|---|---|---|
| Missing or wrong `x-api-key` | 401 | `{ error: "Unauthorised" }` |
| Rate limit exceeded | 429 | `{ message: "Too many requests..." }` (express-rate-limit default) |
| Missing audio file | 400 | `{ error: "No audio file provided" }` |
| Missing/invalid transcript | 400 | `{ error: "Missing or invalid transcript in request body" }` |
| Whisper failure | 500 | `{ error: <message> }` |
| Claude returns invalid JSON | 500 | `{ error: "Claude returned invalid JSON" }` |
| Any other Claude failure | 500 | `{ error: <message> }` |

Temp files are always cleaned up in `finally`. Missing API keys are logged at startup but the process still boots — calls will fail at runtime with an upstream auth error.

## Constraints

- Audio uploads capped at 25 MB (Whisper's own limit)
- JSON request body capped at 50 KB
- Rate limited to 20 requests per 15 minutes on `/analyse` and `/process-audio`
- No persistence — each request is independent, no transcript or insight history stored
- Single process — relies on Replit Autoscale for horizontal scaling

## Eval harness

`evals/run.js` iterates `evals/test-cases.js`, posting each transcript to `/analyse` and running per-case assertion functions against the response. Reports pass/fail per check, per case, and an overall percentage. Use it to validate prompt or model changes before deploying.

```bash
node evals/run.js                                                # local (no auth needed if CLIENT_API_KEY unset)
API_URL=https://your-host CLIENT_API_KEY=... node evals/run.js  # remote
```

`evals/test-process-audio-schema.js` covers `/process-audio` specifically: it confirms the default PM schema still applies when no `schema` is passed, and that a custom schema (e.g. a bookkeeping-style schema) fully overrides the default categories rather than merging with them. It requires a real audio fixture (`evals/fixtures/`) since `/process-audio` only accepts multipart audio.

```bash
node evals/test-process-audio-schema.js
API_URL=https://your-host CLIENT_API_KEY=... node evals/test-process-audio-schema.js
```
