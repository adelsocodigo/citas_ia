import type { Handler } from "@netlify/functions";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ENV_MODEL = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
const MODEL = ENV_MODEL.replace(/^models\//, "");

function json(status: number, body: unknown) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!GEMINI_API_KEY) return json(500, { error: "GEMINI_API_KEY missing" });

    let parsed: any = {};
    try { parsed = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON body" }); }
    const message = parsed?.message;
    if (!message || typeof message !== "string") return json(400, { error: "message required" });

    // Fecha/hora actual en Europe/Madrid (para dar contexto SI el modelo lo pide)
    const now = new Date();
    const nowMadrid = now.toLocaleString("sv-SE", { timeZone: "Europe/Madrid", hour12: false }).replace(" ", "T").slice(0,16);
    // sv-SE -> "YYYY-MM-DD HH:mm:ss" recortado a "YYYY-MM-DDTHH:mm"

    const sys = `Eres un asistente de reservas.
- Zona: Europe/Madrid (interpreta horas como locales)
- Slots: 60 minutos, HORA EN PUNTO (09:00, 10:00, ...)
- Horario: L–V 09:00–17:00, Sáb 09:00–13:00, Dom cerrado
- Si el usuario pide la "próxima disponible" o "siguiente hora libre", marca intent="next".
- Si te preguntan "qué día/fecha es hoy", NO inventes: responde con la cadena literal TODAY_IS=${nowMadrid}.
Devuelve EXCLUSIVAMENTE un JSON (sin texto extra, sin backticks) con este esquema:
{
  "reply": "<texto en español>",
  "datetimeISO": "YYYY-MM-DDTHH:mm" | "",
  "intent": "check" | "book" | "smalltalk" | "next",
  "altSuggestion": "<si procede>"
}`;

    const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: `${sys}\nUsuario: ${message}` }] }],
      generationConfig: { temperature: 0.2 }
    };

    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 12000);
    let resp: Response;
    try {
      resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ac.signal } as any);
    } catch (e: any) {
      clearTimeout(timer);
      return json(502, { error: "gemini_fetch_failed", detail: String(e?.message || e) });
    } finally { clearTimeout(timer); }

    const raw = await resp.text().catch(() => "");
    if (!resp.ok) return json(502, { error: "gemini_error", status: resp.status, raw: raw.slice(0, 400) });

    let data: any; try { data = JSON.parse(raw); } catch { return json(502, { error: "gemini_bad_json", raw: raw.slice(0, 200) }) }
    let text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    text = String(text).trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    try {
      const obj = JSON.parse(text);
      // Pequeño post-proceso: si el modelo respondió con TODAY_IS=..., convierte a respuesta útil
      if (typeof obj.reply === "string" && /TODAY_IS=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(obj.reply)) {
        const iso = obj.reply.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)![0];
        obj.reply = `Hoy es ${iso} (hora de Europe/Madrid).`;
      }
      return json(200, obj);
    } catch {
      return json(200, { reply: "¿Puedes repetir la fecha/hora?", datetimeISO: "", intent: "smalltalk", altSuggestion: "" });
    }
  } catch (e: any) {
    return json(500, { error: "ai_gemini_handler_crash", detail: String(e?.message || e) });
  }
};
