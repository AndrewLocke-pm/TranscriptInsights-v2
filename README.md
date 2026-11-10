# Transcript Insights

**A reusable voice-to-structured-data extraction engine.**

Transcript Insights converts speech or raw transcript text into structured, application-specific information. Instead of being limited to meeting summaries, the service accepts a caller-defined extraction schema so different applications can extract the fields that matter to their workflow.

The underlying product hypothesis: people communicate naturally through speech, but business software usually expects structured forms and records. AI can reduce the manual work between those two interfaces — provided the extracted information is sufficiently accurate, evidence-backed and validated before use.

> Project status: The backend and schema-driven extraction flow are implemented. The frontend and real-audio end-to-end validation remain in progress. Example integrations below illustrate intended use; they are not all production integrations.

## Example use cases

| Application | Natural-language input | Intended structured result |
| --- | --- | --- |
| **BookkeepGenie** | "I bought diesel for R1,250 yesterday using my business card." | Proposed transaction: amount, currency, description, date, payment method and candidate category; downstream verification before ledger posting. |
| **StrikeCRM** | "I spoke to Sarah at Acme. They're interested in a pilot next month. Send pricing by Friday." | Proposed contact/opportunity updates, follow-up task and due date; downstream entity matching and approval. |
| **Client discovery** | Recorded sales or discovery conversation | Pain points, unmet needs, opportunities, objections, commitments and supporting transcript evidence. |
| **Product management** | Stakeholder discussion or user interview | Decisions, action items, risks, blockers and evidence-backed user needs. |

StrikeCRM was built on the v1 extraction engine. The BookkeepGenie and other examples above describe proposed application workflows, not verified end-to-end integrations.

## Why I built this

The initial prototype explored whether AI could extract useful product-management insights from meeting transcripts. The more important finding was that the extraction step was not inherently specific to meetings or product management.

Version 2 generalised the engine by introducing **per-request extraction schemas**. The same audio/transcript pipeline can now be called with different categories and fields, without maintaining a separate service for each domain.

This project explores three product and engineering questions:

1. Can natural language become a lower-friction data-entry interface for business applications?
2. How can extraction be made reusable without blending the extraction layer with each application's business logic?
3. What evidence and evaluations are required before extracted information can be trusted in downstream workflows?

## Current capabilities

- **Transcription:** Accept an audio upload (up to 25 MB) and return transcript text.
- **Extraction:** Accept transcript text and return structured information using the default schema or a caller-defined schema.
- **Audio-to-extraction:** Chain transcription and extraction in one request.
- **Dynamic schemas:** Generate category-specific extraction instructions and an output template from the supplied schema.
- **Default PM schema:** Extract decisions, action items, risks/blockers and user needs, plus meeting metadata.
- **Evaluation harness:** Run assertion-based regression checks against representative transcripts.
- **API safeguards:** API-key checks, CORS restrictions, rate limiting, request-size limits and temporary-file cleanup.

## From v1 to v2

| Design area | v1 | v2 |
| --- | --- | --- |
| Domain | Fixed product-management extraction | Caller-defined extraction categories and fields |
| Reuse | Adapt or fork the prompt for other use cases | Use one API with different per-request schemas |
| Attribution | Looser owner/risk attribution | Explicit unknown-owner and unknown-risk-raiser rules |
| JSON handling | Model output could break parsing | Defensive pre-parser for common code-fence deviations |
| Reliability | Limited evaluation | Regression evaluation harness plus custom-schema test |
| API hardening | Limited initial safeguards | API-key, origin restrictions, rate limits and size limits |

The objective of v2 was not to build a broader meeting-notes application. It was to separate a reusable extraction capability from any one product interface.

## Architecture

```text
Business application / caller
    |
    +-- Audio ----------------> POST /transcribe ----------> Transcript
    |                             |
    |                             +-- OpenAI whisper-1
    |
    +-- Audio + schema -------> POST /process-audio
    |                             |
    |                             +-- Transcription -> Extraction
    |
    +-- Transcript + schema -> POST /analyse
                                  |
                                  +-- buildSystemPrompt(schema)
                                  +-- Claude extraction
                                  +-- extractJSON() / JSON.parse()
                                  |
                                  v
                            Structured candidate data
                                  |
                                  v
                 Application-specific validation / approval
                 (owned by the consuming application)
```

The frontend is a separate React/Vite/Tailwind application. The backend is a Node/Express service hosted on Replit Autoscale.

**Architectural boundary:** Transcript Insights extracts information; it does not decide whether a transaction is valid, whether a CRM contact is the correct record, or whether an update may be committed. Those checks belong to the consuming application.

## API

All endpoints are rooted at `/`. Non-health endpoints require an `x-api-key` header.

| Method | Endpoint | Input | Output |
| --- | --- | --- | --- |
| GET | `/health` | None | `{ "status": "ok" }` |
| POST | `/transcribe` | Multipart `audio` (max 25 MB) | `{ "transcript": "..." }` |
| POST | `/analyse` | JSON `{ "transcript": "...", "schema": { ... } }` | Structured extraction object |
| POST | `/process-audio` | Multipart `audio`, optional JSON-encoded `schema` field | `{ "transcript": "...", "insights": { ... } }` |

When `schema` is omitted, the default PM schema is used. When a custom schema is supplied, its extraction categories replace the default categories; common top-level metadata remains part of the response.

### Default extraction shape

```json
{
  "meeting_type": "string",
  "decisions": [{ "decision": "string", "context": "string" }],
  "action_items": [{ "owner": "string", "task": "string", "due": null }],
  "risks_and_blockers": [{ "risk": "string", "raised_by": null, "severity": "medium" }],
  "user_needs": [{ "need": "string", "source_quote": "string" }],
  "confidence": "medium",
  "notes": null
}
```

The example above illustrates field types, not an actual extraction result. See `schemas/default-pm.js` for the source schema.

### Extraction rules

- Extract only information explicitly stated or clearly supported by the input.
- Distinguish agreed decisions from suggestions and unresolved discussions.
- Use `"Unassigned"` for an action-item owner when the transcript does not identify one.
- Use `null` for an unknown risk raiser; never invent a name.
- Include source quotes for user needs in the default schema.
- Return machine-readable JSON for downstream rendering and validation.

These rules are model instructions, not guarantees of factual accuracy. Consuming systems should validate outputs before taking consequential actions.

## Evaluation

The evaluation harness calls `/analyse` with representative transcripts and executes assertions about expected extraction behaviour, including grounding, avoiding fabricated actions, attribution, risk severity and source quotes.

Representative cases include stakeholder reviews, user interviews, informal standups, design discussions, voice notes and sales calls. A separate test exercises `/process-audio` with a custom extraction schema.

```bash
# Local API
node evals/run.js

# Remote API (shell environment-variable syntax)
API_URL=https://your-host CLIENT_API_KEY=your-key node evals/run.js

# Audio + custom-schema regression
node evals/test-process-audio-schema.js
```

**Last documented result:** 38/39 checks passing (~97%). The local project reference also contains an inconsistent figure of 49 checks and inconsistent archetype counts; these need to be reconciled against the current test files before treating any figure as definitive. This is a test-assertion pass rate, not a measured 97% accuracy rate on real-world audio.

Future evaluation work should use independently annotated, cross-domain examples and measure extraction precision/recall, owner or entity attribution, evidence validity, abstention, schema conformance, latency and cost.

## Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 24 (ESM) |
| API | Express (verify exact major version from `package.json`) |
| Transcription | OpenAI `whisper-1` |
| Extraction | Anthropic Claude (`claude-sonnet-4-6` in the project reference) |
| Uploads | Multer |
| Frontend | React, Vite, Tailwind; built with Bolt, in progress |
| Hosting | Replit Autoscale |

## Security and data handling

The implemented backend includes API-key checks for non-health endpoints, origin allowlisting, rate limiting on analysis routes, a 50 KB JSON request limit, a 25 MB audio upload limit and temporary upload cleanup.

The service does not implement a database or application-level transcript history. However, recordings and transcripts are sent to third-party model providers for processing, so "stateless" should not be interpreted as a guarantee of zero provider or infrastructure retention.

**Known integration issue:** The browser frontend cannot safely include a shared `x-api-key` secret while calling the backend directly. A server-side proxy, authenticated backend-for-frontend, or server-to-server integration is required before publishing such a flow. CORS alone does not protect credentials or authenticate callers.

## Current status and next steps

**Implemented:** Backend transcription and extraction endpoints; default and per-request schemas; attribution rules; defensive parsing; automated regression checks; baseline API safeguards.

**In progress / not yet established:** Fully connected browser frontend, realistic audio end-to-end validation, verified cross-domain accuracy, validated BookkeepGenie integration, and production-readiness assessment.

Priorities:

1. Resolve the browser/API authentication design before exposing a public frontend.
2. Re-run and reconcile evaluation assertions and documentation.
3. Benchmark native schema-constrained model outputs against the current prompt-generated JSON approach.
4. Extend evidence checks across categories and test on real, annotated audio/transcript examples.
5. Demonstrate one application workflow from voice input to a human-confirmed proposed record update.

## Product and architecture lessons

The most important evolution was recognising that the value was not a meeting summary. It was a reusable interface between unstructured natural language and structured application records.

The second lesson is to challenge custom AI infrastructure as model capabilities improve. Native structured-output APIs may replace some prompt and JSON-repair logic, while application-specific validation, provenance, evaluation and workflow integration remain important.

Transcript Insights is a working technical prototype and a product architecture exploration — not a claim of validated commercial demand or a fully deployed cross-application platform.

---

Built as proof of work by Andrew Locke, Technical Product Lead and founder of Sabrulo, an independent AI product and strategy practice.
