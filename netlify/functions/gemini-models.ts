import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY missing" }) };

  for (const version of ['v1', 'v1beta']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/${version}/models?key=${KEY}`);
      const raw = await r.text();
      if (r.ok) {
        return { statusCode: 200, body: JSON.stringify({ version, models: JSON.parse(raw) }, null, 2) };
      }
    } catch (e: any) {
      // intenta siguiente versión
    }
  }
  return { statusCode: 502, body: JSON.stringify({ error: "models_list_failed" }) };
};
