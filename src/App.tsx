import React, { useEffect, useRef, useState } from "react";
import "./styles.css";

// ================== Config ==================
const SLOT_MINUTES = 60;
const MAD_TZ = "Europe/Madrid";

// ================== Tipos ==================
type DParts = { year:number; month:number; day:number; hour:number; minute:number };
type Role = "user" | "assistant";
type Msg = { role: Role; text: string };
type Draft = { iso?: string; name?: string; email?: string; notes?: string };

// ================== Utilidades fecha/TZ ==================
const pad2 = (n: number) => String(n).padStart(2, "0");

const WEEKDAYS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const MONTH_INDEX: Record<string, number> = {
  "enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,
  "julio":7,"agosto":8,"septiembre":9,"setiembre":9,"octubre":10,"noviembre":11,"diciembre":12
};

function nowMadridParts(): DParts {
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: MAD_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}
function partsAddHours(p: DParts, hours: number): DParts {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  d.setUTCHours(d.getUTCHours() + hours);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}
function weekdayZellers(y: number, m: number, d: number): number {
  if (m < 3) { m += 12; y -= 1; }
  const K = y % 100, J = Math.floor(y / 100);
  const h = (d + Math.floor((13 * (m + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7;
  return (h + 6) % 7; // 0=Dom..6=Sáb
}
function humanFromISO(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return iso;
  const y = +m[1], mo = +m[2], d = +m[3], hh = +m[4], mm = +m[5];
  const w = weekdayZellers(y, mo, d);
  return `${WEEKDAYS[w]}, ${d} de ${MONTHS[mo-1]} de ${y}, ${pad2(hh)}:${pad2(mm)}`;
}
function humanTodayMadrid(): string {
  const p = nowMadridParts();
  const w = weekdayZellers(p.year, p.month, p.day);
  return `${WEEKDAYS[w]}, ${p.day} de ${MONTHS[p.month-1]} de ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

// ================== Validación horario ==================
function isBusinessISO(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return false;
  const [, y, mo, d, h, mi] = m;
  if (+mi !== 0) return false;
  const w = weekdayZellers(+y, +mo, +d);
  if (w === 0) return false; // domingo
  if (w >= 1 && w <= 5) return +h >= 9 && +h < 17;  // L–V 9–16:59
  if (w === 6) return +h >= 9 && +h < 13;          // Sáb 9–12:59
  return false;
}

// ================== API (Netlify Functions) ==================
async function aiParse(text: string) {
  try {
    const r = await fetch("/.netlify/functions/ai-gemini", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function checkAvailability(iso: string) {
  const r = await fetch(`/.netlify/functions/check-availability?iso=${encodeURIComponent(iso)}`);
  return r.json();
}
async function book(payload: { iso: string; name: string; email: string; notes?: string }) {
  const r = await fetch("/.netlify/functions/book", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return r.json();
}
async function suggestSlots(params: { day?: "hoy"|"manana"|"fecha"; period?: "manana"|"tarde"; count?: number; dateISO?: string }) {
  const q = new URLSearchParams();
  if (params.day) q.set("day", params.day);
  if (params.period) q.set("period", params.period);
  if (params.count) q.set("count", String(params.count));
  if (params.dateISO) q.set("dateISO", params.dateISO);
  const r = await fetch(`/.netlify/functions/suggest-slots?${q.toString()}`);
  return r.json();
}
async function availabilitySummary() {
  const r = await fetch(`/.netlify/functions/availability-summary`);
  return r.json();
}

// ================== Detectores ==================
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const ASK_TODAY_RE = /\b(que|qué)?\s*(fecha|día)\s*(es)?\s*hoy\b|en\s+qué\s+d[ií]a\s+estamos|qué\s+fecha\s+es\s+hoy/iu;
const PERIOD_MORNING_RE  = /\b(por la ma[nñ]ana|de la ma[nñ]ana)\b/i;
const PERIOD_AFTERNOON_RE= /\b(por la tarde|de la tarde)\b/i;

// Elección de periodo con palabras sueltas (solo en seguimiento)
const CHOICE_MORNING_RE   = /\b(mañana|manana|mañanita|temprano|tempranito)\b/i; // periodo mañana
const CHOICE_AFTERNOON_RE = /\b(tarde|tardecita|tardecito)\b/i;                  // periodo tarde

const WEEKDAY_RE = /\b(lunes|martes|mi[eé]rcoles|miércoles|jueves|viernes|s[áa]bado|sabado|domingo)\b/i;
function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
const WEEKDAY_MAP: Record<string, number> = {
  "domingo": 0, "lunes": 1, "martes": 2, "miercoles": 3, "miércoles": 3,
  "jueves": 4, "viernes": 5, "sabado": 6, "sábado": 6
};
// “lunes 17 (de mes?)”
const WEEKDAY_DAY_RE = /\b(lunes|martes|mi[eé]rcoles|miércoles|jueves|viernes|s[áa]bado|sabado|domingo)\s+(\d{1,2})(?:\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))?\b/i;

function findYMDForWeekdayDay(targetWeekday: number, dayOfMonth: number, fixedMonth?: number) {
  const now = nowMadridParts();
  let month = fixedMonth ?? now.month;
  let year = now.year;

  if (fixedMonth) {
    if (year === now.year && (fixedMonth < now.month || (fixedMonth === now.month && dayOfMonth < now.day))) {
      year = year + 1;
    }
    const dt = new Date(Date.UTC(year, fixedMonth - 1, dayOfMonth, 12, 0));
    const w = weekdayZellers(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    if (w !== targetWeekday) {
      for (let i = 1; i <= 6; i++) {
        const y2 = year + i;
        const d2 = new Date(Date.UTC(y2, fixedMonth - 1, dayOfMonth, 12, 0));
        const w2 = weekdayZellers(d2.getUTCFullYear(), d2.getUTCMonth() + 1, d2.getUTCDate());
        if (w2 === targetWeekday) return { y: d2.getUTCFullYear(), m: d2.getUTCMonth() + 1, d: d2.getUTCDate() };
      }
    }
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  for (let i = 0; i < 12; i++) {
    const dObj = new Date(Date.UTC(year, month - 1, dayOfMonth, 12, 0));
    const w = weekdayZellers(dObj.getUTCFullYear(), dObj.getUTCMonth() + 1, dObj.getUTCDate());
    const isPast =
      dObj.getUTCFullYear() < now.year ||
      (dObj.getUTCFullYear() === now.year && dObj.getUTCMonth() + 1 < now.month) ||
      (dObj.getUTCFullYear() === now.year && dObj.getUTCMonth() + 1 === now.month && dayOfMonth < now.day);
    if (w === targetWeekday && !isPast) {
      return { y: dObj.getUTCFullYear(), m: dObj.getUTCMonth() + 1, d: dObj.getUTCDate() };
    }
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { y: now.year, m: now.month, d: dayOfMonth };
}

// ================== Parser natural ==================
function parseExplicitISO(text: string, anchorDateISO?: string): string {
  const lower = text.toLowerCase();

  // dd/mm hh(:mm)?
  const m1 = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (m1) {
    const [, dd, mm, yyyyOpt, hh] = m1;
    const yyyy = yyyyOpt ? Number(yyyyOpt.length === 2 ? "20" + yyyyOpt : yyyyOpt) : nowMadridParts().year;
    let hour = Number(hh);
    if (/\b(por la tarde|de la tarde)\b/i.test(lower) && hour >=1 && hour <=11) hour += 12;
    if (/\b(por la ma[nñ]ana|de la ma[nñ]ana)\b/i.test(lower) && hour === 12) hour = 0;
    return `${yyyy}-${pad2(Number(mm))}-${pad2(Number(dd))}T${pad2(hour)}:00`;
    }

  // hh(:mm)? am/pm? → usa fecha ancla si viene, si no hoy/mañana según hora
  const m2 = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (m2) {
    let [, hh, _mm, ampm] = m2 as any;
    let hour = Number(hh);
    if (/\b(por la tarde|de la tarde)\b/i.test(lower) && hour >=1 && hour <=11) hour += 12;
    if (/\b(por la ma[nñ]ana|de la ma[nñ]ana)\b/i.test(lower) && hour === 12) hour = 0;
    if (ampm) { const isPM = (ampm as string).toLowerCase() === "pm"; hour = (hour % 12) + (isPM ? 12 : 0); }

    let dateRef: {y:number,m:number,d:number};
    if (anchorDateISO && /^\d{4}-\d{2}-\d{2}/.test(anchorDateISO)) {
      const [y,m,d] = anchorDateISO.split("T")[0].split("-").map(Number);
      dateRef = { y, m, d };
    } else {
      const now = nowMadridParts();
      dateRef = { y: now.year, m: now.month, d: now.day };
      if (hour <= now.hour) {
        const plus = partsAddHours({ ...now, minute: 0 }, 24);
        dateRef = { y: plus.year, m: plus.month, d: plus.day };
      }
    }
    return `${dateRef.y}-${pad2(dateRef.m)}-${pad2(dateRef.d)}T${pad2(hour)}:00`;
  }

  return "";
}

// ================== Contact parser ==================
function parseContact(text: string, prev: Draft): Draft {
  const out: Draft = { ...prev };
  const raw = text.trim();

  // Email
  const email = raw.match(EMAIL_RE)?.[0];
  if (email) out.email = email;

  // Nombre aunque venga con email
  let tmp = raw;
  if (email) tmp = tmp.replace(email, " ");
  tmp = tmp
    .replace(/(^|\b)(mi\s*nombre\s*es|me\s*llamo|soy|nombre:|mi)\b/gi, " ")
    .replace(/\b(correo|email|mail|e-mail|mi\s*correo\s*es|es:)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (tmp && tmp.length >= 2) {
    tmp = tmp.replace(/^[\-:,]+|[\-:,]+$/g, "").trim();
    const name = tmp.split(" ").filter(Boolean).map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
    if (name.length >= 2) out.name = name;
  }

  return out;
}

// ================== Componente ==================
export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: `Hola 👋 Soy tu asistente de reservas.\nEstoy mirando disponibilidad…` }
  ]);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [pendingDayContext, setPendingDayContext] = useState<"hoy"|"manana"|"fecha"|null>(null);
  const [pendingPeriod, setPendingPeriod] = useState<"manana"|"tarde"|null>(null);
  const [pendingDateISO, setPendingDateISO] = useState<string|null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await availabilitySummary();
        if (s?.ok) {
          const today = s.today?.rangeHuman ? `Hoy tengo disponibilidad desde **${s.today.rangeHuman.start}** hasta **${s.today.rangeHuman.end}**` : `Hoy no tengo disponibilidad`;
          const tomorrow = s.tomorrow?.any ? `y **mañana** en varios horarios.` : `y **mañana** sin huecos por ahora.`;
          setMsgs([
            { role: "assistant", text: `Hola 👋 Soy tu asistente de reservas.\n${today} ${tomorrow}\n¿Te viene mejor **por la mañana** o **por la tarde**? También puedes decirme una hora concreta (ej: "lunes 17", "sábado 9 de la mañana", "hoy 10:00").` }
          ]);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, pending]);

  async function handleSend(text: string) {
    const say = (m: Msg) => setMsgs((arr) => [...arr, m]);
    say({ role: "user", text });
    setPending(true);

    // ¿Qué día es hoy?
    if (ASK_TODAY_RE.test(text)) {
      say({ role: "assistant", text: `Hoy es ${humanTodayMadrid()} (hora de ${MAD_TZ}).` });
      setPending(false); return;
    }

    // Si hay borrador → permitir cambio/cancelación y recoger nombre/correo
    if (draft.iso) {
      const lower = text.toLowerCase();

      // Cancelar borrador
      if (/\b(cancelar|mejor\s+no|olv[ií]dalo|dejarlo)\b/i.test(lower) && !parseExplicitISO(lower, draft.iso)) {
        setDraft({});
        setPendingDayContext(null); setPendingPeriod(null); setPendingDateISO(null);
        say({ role: "assistant", text: "Listo, cancelamos esa hora. ¿Buscamos otra? Di **hoy**/**mañana** o una hora concreta." });
        setPending(false); return;
      }

      // Cambiar a “lunes 17 (de mes?)” sin hora → pregunta mañana/tarde
      const wdDay = lower.match(WEEKDAY_DAY_RE);
      if (/\b(cambiar|modificar|mejor|otra\s+hora|prefiero|no,\s*mejor|cambiarla)\b/i.test(lower) && wdDay) {
        const wd = wdDay[1]; const dayNum = Number(wdDay[2]); const monthName = wdDay[3]?.toLowerCase();
        const wdKey = stripDiacritics(wd);
        const idx = WEEKDAY_MAP[wdKey] ?? WEEKDAY_MAP[wd] ?? null;
        if (idx !== null && idx !== undefined) {
          const fixedMonth = monthName ? MONTH_INDEX[monthName] : undefined;
          const ymd = findYMDForWeekdayDay(idx, dayNum, fixedMonth);
          const dateISO = `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}`;
          setPendingDayContext("fecha"); setPendingDateISO(dateISO); setPendingPeriod(null);
          say({ role: "assistant", text: `Para **${wd} ${dayNum}** ¿prefieres por la **mañana** o por la **tarde**?` });
          setPending(false); return;
        }
      }

      // Cambio con hora explícita
      const explicitISO = parseExplicitISO(lower, draft.iso);
      if (explicitISO) {
        if (!isBusinessISO(explicitISO)) { say({ role: "assistant", text: "Esa nueva hora no es válida (L–V 9–17, sáb 9–13)." }); setPending(false); return; }
        const avail = await checkAvailability(explicitISO);
        if (!avail.available) { say({ role: "assistant", text: `Para ${humanFromISO(explicitISO)} ya no hay hueco. ¿Te propongo por la **mañana** o por la **tarde**?` }); setPending(false); return; }
        setDraft({ iso: explicitISO });
        say({ role: "assistant", text: `He cambiado la hora a **${humanFromISO(explicitISO)}**.\nDime tu *nombre* y *correo* para confirmar.` });
        setPending(false); return;
      }

      // Recoger nombre y correo en el mismo mensaje
      const next = parseContact(text, draft);
      setDraft(next);

      if (!next.name || !next.email) {
        if (!next.name && !next.email) say({ role: "assistant", text: "Necesito tu *nombre* y *correo* para confirmar. (Ej: \"Juan Pérez juan@correo.com\"). Si prefieres otra hora, di por ejemplo **lunes 17 por la mañana**." });
        else if (!next.name)          say({ role: "assistant", text: "¿Tu *nombre*, por favor? (O nueva hora: **lunes 11:00**)" });
        else                          say({ role: "assistant", text: "¿Cuál es tu *correo*? (O nueva hora: **lunes 11am**)" });
        setPending(false); return;
      }

      const res = await book({ iso: next.iso!, name: next.name!, email: next.email!, notes: next.notes });
      if (!res.ok) {
        say({ role: "assistant", text: `No pude guardar la cita (${res.error || "error"}). Dime *mañana* o *tarde*, o una hora concreta.` });
      } else {
        const mailMsg = res.emailOk ? "" : `\n(Nota: el email de confirmación no pudo enviarse ahora.)`;
        say({ role: "assistant", text: `✅ Cita confirmada para ${humanFromISO(next.iso!)}.\nConfirmación a ${next.email}.${mailMsg}` });
      }
      setDraft({}); setPending(false); return;
    }

    // Sin borrador: primero “lunes 17 (de mes?)” sin hora
    {
      const lower = text.toLowerCase();
      const wdDay = lower.match(WEEKDAY_DAY_RE);
      if (wdDay) {
        const wd = wdDay[1]; const dayNum = Number(wdDay[2]); const monthName = wdDay[3]?.toLowerCase();
        const wdKey = stripDiacritics(wd);
        const idx = WEEKDAY_MAP[wdKey] ?? WEEKDAY_MAP[wd] ?? null;
        if (idx !== null && idx !== undefined && dayNum >= 1 && dayNum <= 31) {
          const fixedMonth = monthName ? MONTH_INDEX[monthName] : undefined;
          const ymd = findYMDForWeekdayDay(idx, dayNum, fixedMonth);
          const dateISO = `${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}`;
          setPendingDayContext("fecha"); setPendingDateISO(dateISO); setPendingPeriod(null);
          say({ role: "assistant", text: `Para **${wd} ${dayNum}** ¿prefieres por la **mañana** o por la **tarde**?` });
          setPending(false); return;
        }
      }
    }

    // Prioridad: hora/fecha explícita (con hora)
    let dtISO = parseExplicitISO(text);
    if (!dtISO) {
      let ai: any = null; try { ai = await aiParse(text); } catch {}
      if (ai?.datetimeISO) dtISO = String(ai.datetimeISO);
    }
    if (dtISO) {
      if (!isBusinessISO(dtISO)) { say({ role: "assistant", text: "Ese horario no es válido. L–V 9–17 y sábados 9–13 (a la hora en punto)." }); setPending(false); return; }
      const avail = await checkAvailability(dtISO);
      if (!avail.available) {
        say({ role: "assistant", text: `Para ${humanFromISO(dtISO)} no hay disponibilidad. ¿Prefieres **mañana** o **tarde**?` });
        if (/\bhoy\b/i.test(text)) setPendingDayContext("hoy");
        else if (/\bmañana\b|ma[nñ]ana\b/i.test(text)) setPendingDayContext("manana");
        setPending(false); return;
      }
      setDraft({ iso: dtISO });
      say({ role: "assistant", text: `Perfecto, tengo libre **${humanFromISO(dtISO)}**.\nPor favor, dime tu *nombre* y *correo* para confirmarla.\n(Si quieres otra hora, escribe **mejor 11am** o **cambiar a 11:00**.)` });
      setPending(false); return;
    }

    // Flujo guiado base (hoy/mañana + periodo)
    const mentionTomorrow = /\bmañana\b|ma[nñ]ana\b/i.test(text);
    const mentionToday = /\bhoy\b/i.test(text);
    const mentionMorning = PERIOD_MORNING_RE.test(text) || CHOICE_MORNING_RE.test(text);
    const mentionAfternoon = PERIOD_AFTERNOON_RE.test(text) || CHOICE_AFTERNOON_RE.test(text);

    async function offer(day: "hoy"|"manana"|"fecha", period?: "manana"|"tarde", dateISO?: string) {
      const data = await suggestSlots({ day, period, count: 3, dateISO });
      if (data?.ok && data.slots?.length) {
        const lines = data.slots.map((s: any, i: number) => `(${i+1}) ${s.human}`).join("\n");
        setPendingDayContext(day);
        setPendingPeriod(period ?? null);
        if (dateISO) setPendingDateISO(dateISO);
        const tail = `\n\nDime el número (1-${data.slots.length}) o escribe la hora exacta.`;
        const periodText = period ? ` por la **${period === "manana" ? "mañana" : "tarde"}**` : "";
        say({ role: "assistant", text: `Tengo estos huecos ${day === "hoy" ? "para **hoy**" : day === "manana" ? "para **mañana**" : "para esa fecha"}${periodText}:\n${lines}${tail}` });
      } else {
        say({ role: "assistant", text: `No veo huecos en ese periodo. ¿Probamos el otro (mañana/tarde) o una hora concreta?` });
      }
    }

    if (mentionTomorrow) {
      if (mentionMorning)   { await offer("manana","manana"); setPending(false); return; }
      if (mentionAfternoon) { await offer("manana","tarde");  setPending(false); return; }
      say({ role: "assistant", text: "Para **mañana**, ¿prefieres por la **mañana** o por la **tarde**?" });
      setPendingDayContext("manana"); setPending(false); return;
    }
    if (mentionToday) {
      if (mentionMorning)   { await offer("hoy","manana"); setPending(false); return; }
      if (mentionAfternoon) { await offer("hoy","tarde");  setPending(false); return; }
      say({ role: "assistant", text: "Para **hoy**, ¿prefieres por la **mañana** o por la **tarde**?" });
      setPendingDayContext("hoy"); setPending(false); return;
    }

    // Sin intención clara
    say({ role: "assistant", text: "Puedo proponerte huecos **hoy**, **mañana** o una **fecha**. Por ejemplo: **lunes 17**, **viernes por la tarde** o **14/11 09:00**." });
    setPending(false);
  }

  // Seguimiento: elegir número / periodo u hora cuando hay contexto pendiente
  async function handleFollowUp(text: string) {
    const say = (m: Msg) => setMsgs((arr) => [...arr, m]);
    if (!pendingDayContext) return;

    const lower = text.toLowerCase().trim();

    // 0) Si escribe una hora suelta (9, 9am, 10:00...), úsala con fecha ancla del contexto
    const anchor = (() => {
      if (pendingDayContext === "hoy") {
        const p = nowMadridParts();
        return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
      }
      if (pendingDayContext === "manana") {
        const p = partsAddHours(nowMadridParts(), 24);
        return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
      }
      if (pendingDayContext === "fecha" && pendingDateISO) {
        return pendingDateISO;
      }
      return null;
    })();

    if (anchor) {
      const explicitISO = parseExplicitISO(lower, `${anchor}T00:00`);
      if (explicitISO) {
        if (!isBusinessISO(explicitISO)) {
          say({ role: "assistant", text: "Ese horario no es válido. L–V 9–17 y sábados 9–13 (a la hora en punto)." });
          return;
        }
        const avail = await checkAvailability(explicitISO);
        if (!avail.available) {
          say({ role: "assistant", text: `Para ${humanFromISO(explicitISO)} no hay disponibilidad. ¿Prefieres **mañana** o **tarde**?` });
          return;
        }
        setDraft({ iso: explicitISO });
        setPendingDayContext(null); setPendingPeriod(null); setPendingDateISO(null);
        say({ role: "assistant", text: `Perfecto, apunto **${humanFromISO(explicitISO)}**.\nDime tu *nombre* y *correo* para confirmarla.` });
        return;
      }
    }

    // 1) Elige opción por número (cuando ya mostramos una lista)
    const num = lower.match(/^\(?\s*(\d{1,2})\s*\)?$/)?.[1];
    if (num) {
      const data = await suggestSlots({
        day: pendingDayContext,
        period: pendingPeriod ?? undefined,
        count: 5,
        dateISO: pendingDayContext === "fecha" ? pendingDateISO ?? undefined : undefined
      });
      const idx = Number(num) - 1;
      if (data?.ok && data.slots?.[idx]) {
        const iso = data.slots[idx].iso as string;
        const ok = await checkAvailability(iso);
        if (!ok.available) {
          say({ role: "assistant", text: "Ese hueco se tomó recién. ¿Te propongo otras opciones?" });
        } else {
          setDraft({ iso });
          setPendingDayContext(null); setPendingPeriod(null); setPendingDateISO(null);
          say({ role: "assistant", text: `Perfecto, apunto **${humanFromISO(iso)}**.\nDime tu *nombre* y *correo* para confirmarla.` });
        }
      } else {
        say({ role: "assistant", text: "Número fuera de rango. Puedes escribir **mañana** o **tarde**, o una hora concreta (p. ej. 10:00)." });
      }
      return;
    }

    // 2) Elegir periodo cuando el contexto es HOY o MAÑANA (día siguiente)
    if (pendingDayContext === "hoy" || pendingDayContext === "manana") {
      if (CHOICE_MORNING_RE.test(lower) || PERIOD_MORNING_RE.test(lower)) {
        const data = await suggestSlots({ day: pendingDayContext, period: "manana", count: 3 });
        if (data?.ok && data.slots?.length) {
          const lines = data.slots.map((s: any, i: number) => `(${i+1}) ${s.human}`).join("\n");
          say({ role: "assistant", text: `Para **${pendingDayContext === "hoy" ? "hoy" : "mañana"} por la mañana** tengo:\n${lines}\n\nElige 1-${data.slots.length} o escribe una hora exacta.` });
          setPendingPeriod("manana");
        } else {
          say({ role: "assistant", text: "No veo huecos por la mañana. ¿Probamos por la **tarde**?" });
        }
        return;
      }
      if (CHOICE_AFTERNOON_RE.test(lower) || PERIOD_AFTERNOON_RE.test(lower)) {
        const data = await suggestSlots({ day: pendingDayContext, period: "tarde", count: 3 });
        if (data?.ok && data.slots?.length) {
          const lines = data.slots.map((s: any, i: number) => `(${i+1}) ${s.human}`).join("\n");
          say({ role: "assistant", text: `Para **${pendingDayContext === "hoy" ? "hoy" : "mañana"} por la tarde** tengo:\n${lines}\n\nElige 1-${data.slots.length} o escribe una hora exacta.` });
          setPendingPeriod("tarde");
        } else {
          say({ role: "assistant", text: "No veo huecos por la tarde. ¿Probamos por la **mañana**?" });
        }
        return;
      }
    }

    // 3) Elegir periodo cuando el contexto es una FECHA concreta
    if (pendingDayContext === "fecha") {
      if (PERIOD_MORNING_RE.test(lower) || CHOICE_MORNING_RE.test(lower)) {
        const data = await suggestSlots({ day: "fecha", dateISO: pendingDateISO!, period: "manana", count: 3 });
        if (data?.ok && data.slots?.length) {
          const lines = data.slots.map((s: any, i: number) => `(${i+1}) ${s.human}`).join("\n");
          say({ role: "assistant", text: `Para ese día por la **mañana** tengo:\n${lines}\n\nElige 1-${data.slots.length} o escribe una hora exacta.` });
          setPendingPeriod("manana");
        } else {
          say({ role: "assistant", text: "No hay huecos por la mañana. ¿Probamos por la **tarde**?" });
          setPendingPeriod(null);
        }
        return;
      }
      if (PERIOD_AFTERNOON_RE.test(lower) || CHOICE_AFTERNOON_RE.test(lower)) {
        const data = await suggestSlots({ day: "fecha", dateISO: pendingDateISO!, period: "tarde", count: 3 });
        if (data?.ok && data.slots?.length) {
          const lines = data.slots.map((s: any, i: number) => `(${i+1}) ${s.human}`).join("\n");
          say({ role: "assistant", text: `Para ese día por la **tarde** tengo:\n${lines}\n\nElige 1-${data.slots.length} o escribe una hora exacta.` });
          setPendingPeriod("tarde");
        } else {
          say({ role: "assistant", text: "No hay huecos por la tarde. ¿Probamos por la **mañana**?" });
          setPendingPeriod(null);
        }
        return;
      }
    }

    // 4) Sin intención clara en seguimiento
    say({ role: "assistant", text: "¿Prefieres **mañana** o **tarde**? También puedes indicar una hora, por ejemplo **10:00** o **9am**." });
  }

  return (
    <div className="chat-wrap">
      <div className="header">
        <div className="badge">Chat de reservas (Gemini + Firebase + Gmail)</div>
      </div>

      <div className="main">
        <div className="stream" ref={streamRef} id="chat-stream">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className={`bubble ${m.role === "user" ? "user" : "bot"}`}>
                {m.text.split("\n").map((line, k) => <div key={k}>{line}</div>)}
              </div>
            </div>
          ))}
          {pending && (
            <div className="msg assistant">
              <div className="bubble bot">Pensando…</div>
            </div>
          )}
        </div>

        <form
          className="footer"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = input.trim();
            if (!v) return;
            setInput("");
            if (pendingDayContext) {
              await handleFollowUp(v);
              setPending(false);
            } else {
              await handleSend(v);
            }
          }}
        >
          <input
            className="input"
            placeholder='Ej.: "lunes 17", "lunes 17 de noviembre", "sábado 9 de la mañana", "hoy 9am", "14/11 09:00", o "Juan Pérez juan@correo.com"'
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn" type="submit" disabled={pending}>Enviar</button>
        </form>
      </div>

      <div className="hint">
        Puedes escribir <span className="kbd">"Mi nombre es Ana, mi correo es ana@correo.com"</span> en una sola línea.
      </div>
    </div>
  );
}
