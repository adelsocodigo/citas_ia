import { sendConfirmationEmail } from "./utils-email-gmail";

// TODO: reemplaza con tu guardado real en Firebase:
async function saveBookingInDb(payload: { iso: string; name: string; email: string; notes?: string }) {
  // Lanza error si está ocupado, etc.
  return { ok: true, id: payload.iso };
}

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { iso, name, email, notes } = body;

    if (!iso || !name || !email) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "missing_fields" }) };
    }

    const saved = await saveBookingInDb({ iso, name, email, notes });
    if (!saved?.ok) {
      return { statusCode: 409, body: JSON.stringify({ ok: false, error: "slot_taken" }) };
    }

    let emailOk = false;
    let emailId: string | undefined;
    let emailErr: string | undefined;

    try {
      const res = await sendConfirmationEmail({ to: email, name, iso, tz: "Europe/Madrid" });
      emailOk = true;
      emailId = res.infoId;
    } catch (err: any) {
      emailOk = false;
      emailErr = err?.message || String(err);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id: saved.id, emailOk, emailId, emailErr }),
      headers: { "Content-Type": "application/json" },
    };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err?.message || "server_error" }) };
  }
};

export default handler;

