# Product

## Problem

Product managers and client-facing teams sit through meetings every day. The signal — decisions made, who owns what, risks raised, what users actually need — gets buried in transcripts, notes, and recall. Manually extracting it is slow and inconsistent.

## Target users

- Product managers running stakeholder reviews and user research
- Account managers debriefing client calls
- Bookkeepers and finance teams reviewing client calls
- Engineering leads tracking standup outcomes
- Any team that records meetings and needs reliable structured follow-ups

## Core features

1. **Transcribe** — upload an audio file, get a clean text transcript back
2. **Analyse** — submit transcript text, get structured insights back
3. **Process audio end-to-end** — upload audio, get both transcript and insights in one call
4. **Health check** — simple liveness endpoint for monitoring
5. **Dynamic schema** — callers can define their own extraction categories and fields; the system prompt and JSON output shape adjust automatically

## User flows

### Quick analysis of an existing transcript (default PM schema)
1. User has a transcript (from a notetaker, Otter, etc.)
2. POST text to `/analyse`
3. Receive structured JSON: decisions, action items, risks, user needs, confidence, notes

### Quick analysis with a custom schema
1. POST text to `/analyse` with a `schema` object defining categories and fields
2. Claude extracts exactly those categories from the transcript
3. JSON output shape matches the schema — not the default PM shape

### Full audio-to-insights pipeline
1. User records or exports a meeting audio file
2. POST audio to `/process-audio`
3. Receive both the transcript and the structured insights in one response

### Two-step workflow (when user wants to inspect transcript first)
1. POST audio to `/transcribe` → get transcript back
2. User reviews/edits transcript
3. POST corrected transcript to `/analyse` → get insights

## Business rules

- **No fabrication** — the model is instructed to extract only what is explicitly stated or clearly implied. Never invent owners, decisions, or risks.
- **Every action item has an owner** — if the transcript doesn't name one, the owner is `"Unassigned"` rather than guessed.
- **risks_and_blockers.raised_by is null when unknown** — if no specific person raised a concern, `raised_by` is `null`. `"Unassigned"` is reserved for `action_items.owner` only.
- **User needs must be evidence-backed** — each one carries a source quote from the transcript.
- **Confidence is self-reported** — the model rates its own confidence (`high` / `medium` / `low`) based on transcript clarity. Messy or vague meetings should yield `low`.
- **Decisions vs discussions are distinct** — only things actually agreed are decisions; rejected proposals are not.
- **JSON only** — output is always a parseable JSON object, no prose, no markdown.

## Quality bar

The system ships with an eval harness covering six representative meeting types (clean stakeholder review, user interview, messy standup, design review with disagreement, solo voice note, and a B2B sales debrief). Current pass rate is 38/39 checks (~97%).
