import type { Handler } from '@netlify/functions'
import { getDB } from './firebase-init'

const WEEKDAYS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const pad=(n:number)=>String(n).padStart(2,'0');

function weekdayZellers(y:number,m:number,d:number){ if(m<3){m+=12;y-=1} const K=y%100,J=Math.floor(y/100); const h=(d+Math.floor((13*(m+1))/5)+K+Math.floor(K/4)+Math.floor(J/4)+5*J)%7; return (h+6)%7 }
function isBusinessISO(iso:string){
  const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/); if(!m)return false;
  const [,y,mo,d,h,mi]=m; if(+mi!==0)return false;
  const w=weekdayZellers(+y,+mo,+d);
  if(w===0) return false;
  if(w>=1&&w<=5) return +h>=9 && +h<17;
  if(w===6)     return +h>=9 && +h<13;
  return false;
}
function nowMadridParts(){
  const fmt=new Intl.DateTimeFormat("es-ES",{timeZone:"Europe/Madrid",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
  const p=Object.fromEntries(fmt.formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {year:+p.year,month:+p.month,day:+p.day,hour:+p.hour,minute:+p.minute};
}
const isoOf=(y:number,m:number,d:number,h:number)=>`${y}-${pad(m)}-${pad(d)}T${pad(h)}:00`;
function human(iso:string){
  const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)!;
  const y=+m[1], mo=+m[2], d=+m[3], hh=+m[4], mm=+m[5];
  const w=weekdayZellers(y,mo,d);
  return `${WEEKDAYS[w]}, ${d} de ${MONTHS[mo-1]} de ${y}, ${pad(hh)}:${pad(mm)}`;
}

export const handler: Handler = async (event) => {
  try {
    const db = getDB();
    const day = (event.queryStringParameters?.day || "hoy").toLowerCase() as "hoy"|"manana"|"fecha";
    const period = (event.queryStringParameters?.period || "").toLowerCase() as "manana"|"tarde" | "";
    const count = Math.min(Math.max(parseInt(event.queryStringParameters?.count || '3',10) || 3, 1), 10);
    const dateISO = event.queryStringParameters?.dateISO || "";

    const now = nowMadridParts();
    let Y=now.year, M=now.month, D=now.day;

    if (day === "manana") {
      const t = new Date(Date.UTC(now.year, now.month-1, now.day, 12, 0));
      t.setUTCDate(t.getUTCDate()+1);
      Y=t.getUTCFullYear(); M=t.getUTCMonth()+1; D=t.getUTCDate();
    } else if (day === "fecha" && /^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      const [y,m,d] = dateISO.split("-").map(Number);
      Y=y; M=m; D=d;
    }

    const w = weekdayZellers(Y,M,D);
    let startHour = 9;
    let endHour   = (w===6) ? 13 : 17;

    if (period === "manana") endHour = Math.min(endHour, 12);
    if (period === "tarde")  startHour = Math.max(startHour, 12);

    const slots: Array<{iso:string, human:string}> = [];

    for (let h = startHour; h < endHour; h++) {
      const iso = isoOf(Y,M,D,h);
      if (!isBusinessISO(iso)) continue;

      if (day === "hoy") {
        if (Y===now.year && M===now.month && D===now.day) {
          if (h < now.hour) continue;
          if (h === now.hour && now.minute > 0) continue;
        }
      }

      const doc = await db.collection('appointments').doc(iso).get();
      if (!doc.exists) {
        slots.push({ iso, human: human(iso) });
        if (slots.length >= count) break;
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, slots }) };
  } catch (e:any) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e?.message||e) }) };
  }
}
