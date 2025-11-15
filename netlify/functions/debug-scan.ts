import type { Handler } from '@netlify/functions'
import { getDB } from './firebase-init'

// Helpers
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
const pad=(n:number)=>String(n).padStart(2,'0');
const isoOf=(y:number,m:number,d:number,h:number)=>`${y}-${pad(m)}-${pad(d)}T${pad(h)}:00`;

export const handler: Handler = async (event) => {
  try {
    const db = getDB();
    const date = event.queryStringParameters?.date || ""; // YYYY-MM-DD
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { statusCode: 400, body: JSON.stringify({ ok:false, error: "use ?date=YYYY-MM-DD" }) };
    const y=+m[1], mo=+m[2], d=+m[3];

    const w = weekdayZellers(y,mo,d);
    let open=9, close=(w===6?13:17); // exclusivo
    const rows: any[] = [];
    for (let h=open; h<close; h++) {
      const iso = isoOf(y,mo,d,h);
      const valid = isBusinessISO(iso);
      let taken = false;
      if (valid) {
        const doc = await db.collection('appointments').doc(iso).get();
        taken = doc.exists;
      }
      rows.push({ iso, valid, taken, status: !valid ? "invalid" : taken ? "taken" : "free" });
    }
    const firstFree = rows.find(r => r.status === "free")?.iso || null;
    return { statusCode: 200, body: JSON.stringify({ ok:true, date, firstFree, rows }, null, 2) };
  } catch (e:any) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e?.message||e) }) };
  }
}
