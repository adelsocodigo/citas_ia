import type { Handler } from '@netlify/functions'
import { getDB } from './firebase-init'
import { validateBusinessHoursISO } from './utils-schedule'

const WEEKDAYS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const pad=(n:number)=>String(n).padStart(2,'0');
const isoFromParts=(p:{year:number;month:number;day:number;hour:number;minute:number})=>`${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;

function nowMadridParts() {
  const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x=>[x.type,x.value]));
  return { year:+p.year, month:+p.month, day:+p.day, hour:+p.hour, minute:+p.minute };
}
function addHoursLocal(p:{year:number;month:number;day:number;hour:number;minute:number}, h:number) {
  const d = new Date(Date.UTC(p.year, p.month-1, p.day, p.hour, p.minute));
  d.setUTCHours(d.getUTCHours()+h);
  return { year:d.getUTCFullYear(), month:d.getUTCMonth()+1, day:d.getUTCDate(), hour:d.getUTCHours(), minute:d.getUTCMinutes() };
}
function nextWholeHourLocal(p:{year:number;month:number;day:number;hour:number;minute:number}){ return p.minute===0 ? p : addHoursLocal({ ...p, minute:0 }, 1); }
function weekdayZellers(y:number,m:number,d:number){ if(m<3){m+=12;y-=1} const K=y%100,J=Math.floor(y/100); const h=(d+Math.floor((13*(m+1))/5)+K+Math.floor(K/4)+Math.floor(J/4)+5*J)%7; return (h+6)%7 }
function human(iso:string){
  const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)!;
  const y=+m[1], mo=+m[2], d=+m[3], hh=+m[4], mm=+m[5];
  const w=weekdayZellers(y,mo,d);
  return `${WEEKDAYS[w]}, ${d} de ${MONTHS[mo-1]} de ${y}, ${pad(hh)}:${pad(mm)}`;
}

export const handler: Handler = async (event) => {
  const db = getDB();
  const fromISO = event.queryStringParameters?.from || "";
  const days = Math.min(Math.max(parseInt(event.queryStringParameters?.days || '14', 10) || 14, 1), 60);

  let start: {year:number;month:number;day:number;hour:number;minute:number};
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fromISO)) {
    const m = fromISO.match(/\d+/g)!.map(Number);
    start = { year:m[0], month:m[1], day:m[2], hour:m[3], minute:m[4] };
  } else {
    start = nextWholeHourLocal(nowMadridParts());
  }

  const now = nowMadridParts();

  for (let i=0; i<days*24; i++) {
    const slot = addHoursLocal(start, i);
    const iso = isoFromParts({ ...slot, minute:0 });

    const v = validateBusinessHoursISO(iso);
    if (!v.ok) continue;

    const isToday = (slot.year===now.year && slot.month===now.month && slot.day===now.day);
    if (isToday) {
      if (slot.hour < now.hour) continue;
      if (slot.hour === now.hour && now.minute > 0) continue;
    }

    const doc = await db.collection('appointments').doc(iso).get();
    if (!doc.exists) return { statusCode: 200, body: JSON.stringify({ ok:true, iso, human: human(iso) }) };
  }

  return { statusCode: 404, body: JSON.stringify({ ok:false, error:'no_slot_found' }) };
}
