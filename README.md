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
