import type { Handler } from '@netlify/functions'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const { to, subject, html } = JSON.parse(event.body || '{}')
  const key = process.env.RESEND_API_KEY
  const from = process.env.FROM_EMAIL
  if (!key || !from) return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no_email_provider' }) }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, html })
    })
    if (!r.ok) throw new Error(await r.text())
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message }) }
  }
}
