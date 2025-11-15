// 0 = Domingo .. 6 = Sábado (Zeller)
function weekdayZellers(y: number, m: number, d: number): number {
  if (m < 3) { m += 12; y -= 1; }
  const K = y % 100, J = Math.floor(y / 100);
  const h = (d + Math.floor((13 * (m + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7;
  return (h + 6) % 7; // 0=Dom..6=Sáb
}

export function validateBusinessHoursISO(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return { ok: false, reason: 'bad_format' };
  const [, y, mo, d, h, mi] = m;
  const year = +y, month = +mo, day = +d, hour = +h, minute = +mi;

  if (minute !== 0) return { ok: false, reason: 'not_aligned' }; // slots 60 min

  const w = weekdayZellers(year, month, day);
  if (w === 0) return { ok: false, reason: 'sunday_closed' };
  if (w >= 1 && w <= 5) {
    const inRange = hour >= 9 && hour < 17;
    return { ok: inRange, reason: inRange ? undefined : 'outside_hours' };
  }
  if (w === 6) {
    const inRange = hour >= 9 && hour < 13;
    return { ok: inRange, reason: inRange ? undefined : 'outside_hours' };
  }
  return { ok: false, reason: 'outside_hours' };
}

export function formatISO(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function* iterateNextSlots(from: Date, days: number, slotMinutes = 60) {
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  const cur = new Date(from);
  // alinear a hora en punto
  cur.setMinutes(0, 0, 0);
  while (cur < end) {
    yield new Date(cur);
    cur.setHours(cur.getHours() + slotMinutes/60, 0, 0, 0);
  }
}
