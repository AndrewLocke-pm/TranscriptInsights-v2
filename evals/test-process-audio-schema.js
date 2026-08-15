// evals/test-process-audio-schema.js
//
// Validates the /process-audio backend change: optional `schema` field
// in multipart form data, with fallback to defaultPMSchema when absent.
//
// Two checks:
//   1. No schema passed  -> /process-audio still returns defaultPMSchema shape (regression check)
//   2. Bookkeeping schema passed -> response honours it (transactions/follow_ups/client_questions),
//      not the default PM categories
//
// Requires a real audio file fixture, since /process-audio only accepts multipart audio.
// Record a short (~20-30s) test clip and save it at the path below, or point
// AUDIO_FIXTURE_PATH at an existing one.
//
// Usage:
//   node evals/test-process-audio-schema.js
//   API_URL=https://your-host CLIENT_API_KEY=... node evals/test-process-audio-schema.js

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const CLIENT_API_KEY = process.env.CLIENT_API_KEY || '';
const AUDIO_FIXTURE_PATH =
  process.env.AUDIO_FIXTURE_PATH || './evals/fixtures/EvalHenderson.m4a';

// ── The validated BookkeepGenie schema ──────────────────────────────────────
// Matches the schema already confirmed working via curl against /analyse:
// returned transactions, follow_ups, client_questions with confidence: high.

const bookkeepingSchema = {
  categories: [
    {
      key: 'transactions',
      name: 'Transactions',
      description:
        'Specific financial transactions discussed — payments, invoices, amounts, currency',
      fields: [
        { name: 'description', type: 'string' },
        { name: 'amount', type: 'string' },
        { name: 'category', type: 'string' },
      ],
    },
    {
      key: 'follow_ups',
      name: 'Follow-ups',
      description: 'Tasks or items someone needs to action after this call',
      fields: [
        { name: 'item', type: 'string' },
        { name: 'owner', type: 'string' },
        { name: 'due', type: 'string' },
      ],
    },
    {
      key: 'client_questions',
      name: 'Client Questions',
      description: 'Questions or concerns the client raised that need addressing',
      fields: [
        { name: 'question', type: 'string' },
        { name: 'context', type: 'string' },
      ],
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function postAudio({ schema } = {}) {
  if (!fs.existsSync(AUDIO_FIXTURE_PATH)) {
    throw new Error(
      `Audio fixture not found at ${AUDIO_FIXTURE_PATH}. ` +
        `Record a short test clip and save it there, or set AUDIO_FIXTURE_PATH.`
    );
  }

  const form = new FormData();
  const fileBuffer = fs.readFileSync(AUDIO_FIXTURE_PATH);
  const fileName = path.basename(AUDIO_FIXTURE_PATH);
  form.append('audio', new Blob([fileBuffer]), fileName);

  if (schema) {
    form.append('schema', JSON.stringify(schema));
  }

  const res = await fetch(`${API_URL}/process-audio`, {
    method: 'POST',
    headers: CLIENT_API_KEY ? { 'x-api-key': CLIENT_API_KEY } : {},
    body: form,
  });

  const status = res.status;
  const rawText = await res.text();
  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    body = null;
  }

  if (status !== 200) {
    console.log(`  [error] HTTP ${status} — ${rawText.slice(0, 200)}`);
  }

  return { status, body };
}

function check(name, condition) {
  const pass = Boolean(condition);
  console.log(`  ${pass ? '✓' : '✗'} ${name}`);
  return pass;
}

// ── Test 1: no schema -> defaultPMSchema fallback (regression check) ────────

async function testDefaultFallback() {
  console.log('\nTest 1: /process-audio with no schema (defaultPMSchema fallback)');
  const { status, body } = await postAudio();

  const checks = [];
  checks.push(check('status is 200', status === 200));
  checks.push(check('response has transcript field', typeof body?.transcript === 'string'));
  checks.push(check('response has insights field', typeof body?.insights === 'object'));
  checks.push(
    check('insights has default PM categories', body?.insights && [
      'decisions',
      'action_items',
      'risks_and_blockers',
      'user_needs',
    ].every((k) => k in body.insights))
  );
  checks.push(
    check(
      'insights does NOT have bookkeeping categories (no schema bleed)',
      body?.insights &&
        !('transactions' in body.insights) &&
        !('follow_ups' in body.insights)
    )
  );

  return checks.every(Boolean);
}

// ── Test 2: bookkeeping schema passed -> honoured, not default ──────────────

async function testBookkeepingSchema() {
  console.log('\nTest 2: /process-audio with bookkeeping schema');
  const { status, body } = await postAudio({ schema: bookkeepingSchema });

  const checks = [];
  checks.push(check('status is 200', status === 200));
  checks.push(check('response has transcript field', typeof body?.transcript === 'string'));
  checks.push(check('response has insights field', typeof body?.insights === 'object'));
  checks.push(
    check(
      'insights has bookkeeping categories',
      body?.insights && ['transactions', 'follow_ups', 'client_questions'].every(
        (k) => k in body.insights
      )
    )
  );
  checks.push(
    check(
      'insights does NOT have default PM categories (schema fully overrides, not merges)',
      body?.insights &&
        !('decisions' in body.insights) &&
        !('action_items' in body.insights)
    )
  );
  checks.push(
    check(
      'meta fields still present (meeting_type, confidence)',
      body?.insights?.meeting_type !== undefined && body?.insights?.confidence !== undefined
    )
  );

  if (body?.insights) {
    console.log('  — Response insights keys:', Object.keys(body.insights).join(', '));
  }

  return checks.every(Boolean);
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`Running /process-audio schema tests against ${API_URL}`);
  console.log(`Audio fixture: ${AUDIO_FIXTURE_PATH}`);

  const results = [];
  try {
    results.push(await testDefaultFallback());
  } catch (e) {
    console.log(`  ✗ Test 1 threw an error: ${e.message}`);
    results.push(false);
  }

  try {
    results.push(await testBookkeepingSchema());
  } catch (e) {
    console.log(`  ✗ Test 2 threw an error: ${e.message}`);
    results.push(false);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\nResults: ${passed}/${results.length} test groups passed`);

  if (passed < results.length) {
    process.exitCode = 1;
  }
}

run();