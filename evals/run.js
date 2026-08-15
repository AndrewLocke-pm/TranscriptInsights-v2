import { testCases } from './test-cases.js'

const API_URL = process.env.API_URL || 'http://localhost:3001'

// Only change from the original: accepts an optional `schema` and includes
// it in the request body when present. Test cases without a `schema` field
// behave exactly as before (defaultPMSchema, unchanged).
async function analyseTranscript(transcript, schema) {
  const body = schema ? { transcript, schema } : { transcript }

  const response = await fetch(`${API_URL}/analyse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLIENT_API_KEY,
    },
    body: JSON.stringify(body)
  })
  if (response.status === 401) throw new Error('Authentication failed — check API configuration')
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json()
}

async function runEvals() {
  console.log(`\nRunning evals against ${API_URL}\n`)
  console.log('='.repeat(60))

  let totalPassed = 0
  let totalFailed = 0
  let totalChecks = 0

  for (const tc of testCases) {
    console.log(`\n📋 ${tc.id}`)
    console.log(`   ${tc.description}`)

    try {
      // Only change here: pass tc.schema through if the test case defines one.
      const output = await analyseTranscript(tc.transcript, tc.schema)

      const results = tc.checks.map(check => ({
        name: check.name,
        pass: check.fn(output)
      }))

      const passed = results.filter(r => r.pass).length
      const failed = results.filter(r => !r.pass).length
      totalPassed += passed
      totalFailed += failed
      totalChecks += results.length

      const icon = failed === 0 ? '✅' : '⚠️'
      console.log(`   ${icon} ${passed}/${results.length} checks passed`)

      results.forEach(r => {
        console.log(`      ${r.pass ? '✓' : '✗'} ${r.name}`)
      })

      console.log(`   Confidence: ${output.confidence} | Meeting: ${output.meeting_type}`)

    } catch (err) {
      totalFailed += tc.checks.length
      totalChecks += tc.checks.length
      console.log(`   ❌ ERROR: ${err.message}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`\nFINAL: ${totalPassed}/${totalChecks} checks passed`)
  console.log(`       ${testCases.length} transcripts tested`)

  const score = Math.round((totalPassed / totalChecks) * 100)
  console.log(`       Score: ${score}%`)

  if (score === 100) console.log('\n🎉 Perfect score!')
  else if (score >= 80) console.log('\n✅ Good — review failures above')
  else console.log('\n⚠️  Needs work — check prompt or parsing')
}

runEvals()