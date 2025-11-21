import * as nodemailer from "nodemailer";

function humanFromISO(iso: string, tz = "Europe/Madrid") {
  const d = new Date(iso);
  const df = new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return df.format(d);
}

export function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("Faltan GMAIL_USER o GMAIL_APP_PASSWORD en variables de entorno");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendConfirmationEmail(params: {
  to: string;
  name: string;
  iso: string;
  tz?: string;
}) {
  const { to, name, iso, tz = "Europe/Madrid" } = params;
  const from = process.env.FROM_EMAIL || process.env.GMAIL_USER || "reservas@localhost";
  const when = humanFromISO(iso, tz);

  const transporter = getTransport();

  const html = `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif">
    <h2>✅ Cita confirmada</h2>
    <p>Hola <strong>${name}</strong>, tu cita ha sido confirmada para:</p>
    <p style="font-size:16px"><strong>${when} (${tz})</strong></p>
    <hr/>
    <p>Si necesitas cambiar o cancelar, responde a este correo.</p>
  </div>`;

  const text = `Cita confirmada para ${when} (${tz}).\n\nSi necesitas cambiar o cancelar, responde a este correo.`;

  const info = await transporter.sendMail({
    from,
    to,
    subject: `Cita confirmada – ${when}`,
    text,
    html,
  });

  return { ok: true as const, infoId: info.messageId };
}

export async function verifyGmail() {
  const out: any = {
    hasUser: !!process.env.GMAIL_USER,
    hasPass: !!process.env.GMAIL_APP_PASSWORD,
    fromEmail: process.env.FROM_EMAIL || null,
  };

  try {
    const t = getTransport();
    await t.verify();
    out.smtp = "ok";
    return { ok: true as const, ...out };
  } catch (err: any) {
    out.smtp = "fail";
    out.error = err?.message || String(err);
    return { ok: false as const, ...out };
  }
}
