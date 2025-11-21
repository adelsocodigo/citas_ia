import { sendConfirmationEmail } from "./utils-email-gmail";

export const handler = async (event: any) => {
  const to = (event.queryStringParameters?.to || "").trim();
  if (!to) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "missing_to" }) };
  }
  const now = new Date();
  const iso = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16); // +2h

  try {
    const res = await sendConfirmationEmail({ to, name: "SelfTest", iso, tz: "Europe/Madrid" });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, emailId: res.infoId }),
      headers: { "Content-Type": "application/json" },
    };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err?.message || String(err) }) };
  }
};

export default handler;
