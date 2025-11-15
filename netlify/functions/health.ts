import type { Handler } from '@netlify/functions'

export const handler: Handler = async () => {
  const ok = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    firebaseB64: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_B64),
    firebaseProject: Boolean(process.env.FIREBASE_PROJECT_ID)
  }
  return { statusCode: 200, body: JSON.stringify({ ok }) }
}
