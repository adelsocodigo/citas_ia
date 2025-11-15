import type { Handler } from '@netlify/functions'
import { getDB } from './firebase-init'
import { validateBusinessHoursISO } from './utils-schedule'

export const handler: Handler = async (event) => {
  const iso = event.queryStringParameters?.iso
  if (!iso) return { statusCode: 400, body: JSON.stringify({ error: 'iso required' }) }

  const valid = validateBusinessHoursISO(iso)
  if (!valid.ok) {
    return { statusCode: 200, body: JSON.stringify({ available: false, reason: valid.reason || 'outside_hours' }) }
  }

  const db = getDB()
  const doc = await db.collection('appointments').doc(iso).get()
  const available = !doc.exists
  return { statusCode: 200, body: JSON.stringify({ available }) }
}
