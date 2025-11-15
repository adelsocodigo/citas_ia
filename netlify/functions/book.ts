import type { Handler } from '@netlify/functions'
import { getDB } from './firebase-init'
import { validateBusinessHoursISO } from './utils-schedule'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
  const { iso, name, email, notes } = JSON.parse(event.body || '{}')
  if (!iso || !name || !email) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Missing fields' }) }

  const valid = validateBusinessHoursISO(iso)
  if (!valid.ok) return { statusCode: 400, body: JSON.stringify({ ok: false, error: valid.reason || 'outside_hours' }) }

  const db = getDB()
  const ref = db.collection('appointments').doc(iso)
  const snap = await ref.get()
  if (snap.exists) return { statusCode: 409, body: JSON.stringify({ ok: false, error: 'Slot already booked' }) }

  await ref.set({
    name, email, notes: notes || '',
    durationMinutes: 60,
    tz: 'Europe/Madrid',
    createdAt: new Date().toISOString()
  })
  return { statusCode: 200, body: JSON.stringify({ ok: true, id: iso }) }
}
