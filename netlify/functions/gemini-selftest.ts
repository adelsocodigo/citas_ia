// netlify/functions/gemini-selftest.ts
import type { Handler } from "@netlify/functions";

const KEY = process.env.GEMINI_API_KEY;
// Permite "gemini-2.5-flash" o "models/gemini-2.5-flash". Por defecto: 2.5 Flash.
const ENV_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
const MODEL = ENV_MODEL.replace(/^models\//, ""); // normaliza el nombre

function J(status: number, body: unknown) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async () => {
  if (!KEY) return J(500, { ok: false, where: "server", err: "GEMINI_API_KEY missing" });

  const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${KEY}`;
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: "Devuelve SOLO este JSON exacto: {\"ok\":true}" }],
      },
    ],
    generationConfig: { temperature: 0 }, // no usar responseMimeType en REST v1
  };

  try {
    // Timeout defensivo para evitar conexiones colgadas
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12000);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      } as any);
    } finally {
      clearTimeout(t);
    }

    const raw = await resp.text().catch(() => "");
    if (!resp.ok) {
      return J(502, {
        ok: false,
        where: "google",
        status: resp.status,
        raw: raw.slice(0, 400),
      });
    }

    // La respuesta normal de Gemini trae el texto dentro de candidates[0].content.parts[0].text
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return J(502, { ok: false, where: "parse-google", raw: raw.slice(0, 400) });
    }

    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Limpieza por si viene con ```json ... ```
    text = String(text).trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    try {
      const sample = JSON.parse(text);
      return J(200, { ok: true, model: MODEL, sample });
    } catch {
      return J(200, { ok: true, model: MODEL, sampleText: text.slice(0, 200) });
    }
  } catch (e: any) {
    return J(502, { ok: false, where: "network", err: String(e?.message || e) });
  }
};

