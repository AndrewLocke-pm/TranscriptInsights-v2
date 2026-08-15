const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': import.meta.env.VITE_CLIENT_API_KEY,
  }
}

export async function analyseTranscript(transcript) {
  const res = await fetch(`${BACKEND_URL}/analyse`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ transcript })
  })
  if (res.status === 401) {
    throw new Error('Authentication failed — check API configuration')
  }
  if (!res.ok) throw new Error(`Backend error: ${res.status} ${res.statusText}`)
  return res.json()
}
