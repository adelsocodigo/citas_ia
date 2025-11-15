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
function isoOf(y:number,m:number,d:number,hh:number,mm:number=0){ return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}` }
function human(iso:string){
  const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)!;
  const y=+m[1], mo=+m[2], d=+m[3], hh=+m[4], mm=+m[5];
  const w=weekdayZellers(y,mo,d);
  return `${WEEKDAYS[w]}, ${d} de ${MONTHS[mo-1]} de ${y}, ${pad(hh)}:${pad(mm)}`;
}

async function dayRangeForward(db:FirebaseFirestore.Firestore, y:number,m:number,d:number, nowH:number, nowMin:number) {
  const w = weekdayZellers(y,m,d);
  let openH = 9;
  let closeH = (w===6) ? 13 : 17;

  let startH = openH;
  const today = (()=>{ const n=nowMadridParts(); return (n.year===y && n.month===m && n.day===d); })();
  if (today) {
    const nextHour = nowMin>0 ? (nowH+1) : nowH;
    startH = Math.max(openH, nextHour);
  }
  if (startH >= closeH) return { any:false as const };

  let first:string|null=null, last:string|null=null, any=false;
  for(let hh=startH; hh<closeH; hh++){
    const iso=isoOf(y,m,d,hh,0); if(!isBusinessISO(iso)) continue;
    const doc=await db.collection('appointments').doc(iso).get();
    if(!doc.exists){ any=true; if(!first) first=iso; last=iso; }
  }
  return any ? { any:true as const, rangeHuman:{ start: human(first!), end: human(last!) } } : { any:false as const };
}

async function dayRangeWhole(db:FirebaseFirestore.Firestore, y:number,m:number,d:number) {
  const w = weekdayZellers(y,m,d);
  let openH = 9;
  let closeH = (w===6) ? 13 : 17;

  let first:string|null=null, last:string|null=null, any=false;
  for(let hh=openH; hh<closeH; hh++){
    const iso=isoOf(y,m,d,hh,0); if(!isBusinessISO(iso)) continue;
    const doc=await db.collection('appointments').doc(iso).get();
    if(!doc.exists){ any=true; if(!first) first=iso; last=iso; }
  }
  return any ? { any:true as const, rangeHuman:{ start: human(first!), end: human(last!) } } : { any:false as const };
}

export const handler: Handler = async () => {
  try {
    const db = getDB();
    const now = nowMadridParts();

    const today = await dayRangeForward(db, now.year, now.month, now.day, now.hour, now.minute);

    const t = new Date(Date.UTC(now.year, now.month-1, now.day, 12, 0)); t.setUTCDate(t.getUTCDate()+1);
    const tomorrow = await dayRangeWhole(db, t.getUTCFullYear(), t.getUTCMonth()+1, t.getUTCDate());

    return { statusCode: 200, body: JSON.stringify({ ok:true, today, tomorrow }) };
  } catch(e:any) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e?.message||e) }) };
  }
}
