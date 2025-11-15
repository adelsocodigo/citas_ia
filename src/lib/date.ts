export const pad2 = (n: number) => String(n).padStart(2, '0')

export const formatDateTimeISO = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`

export const toLocalHuman = (d: Date) =>
  d.toLocaleString('es-ES', { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function parseSpanishDateTime(input?: string | null): Date | null {
  if (!input || typeof input !== 'string') return null
  const m1 = input.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(\d{1,2})(?::(\d{2}))?\b/i)
  if (m1) {
    const [_, dd, mm, yyyyOpt, hh, minOpt] = m1
    const now = new Date()
    const yyyy = yyyyOpt ? Number(yyyyOpt.length === 2 ? '20' + yyyyOpt : yyyyOpt) : now.getFullYear()
    const date = new Date(yyyy, Number(mm) - 1, Number(dd), Number(hh), Number(minOpt || 0))
    if (!isNaN(date.getTime())) return date
  }
  const m2 = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  if (m2) {
    let [_, hh, mm, ampm] = m2 as any
    let hour = Number(hh)
    if (ampm) { const isPM = (ampm as string).toLowerCase() === 'pm'; hour = (hour % 12) + (isPM ? 12 : 0) }
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, Number(mm || 0))
    if (next <= now) next.setDate(next.getDate() + 1)
    return next
  }
  return null
}
