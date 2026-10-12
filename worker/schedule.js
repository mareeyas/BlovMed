export const OFFSETS = [0, 10, 25]; // minutes after the dose time: reminder, nag, nag

export function localNow(tz, ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { ymd: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}

// Returns the notifications that should go out right now for one user record.
export function dueMessages(rec, ms) {
  const n = localNow(rec.tz, ms), y = localNow(rec.tz, ms - 864e5);
  const days = [{ ymd: n.ymd, min: n.min }, { ymd: y.ymd, min: n.min + 1440 }]; // today, and yesterday (for nags after midnight)
  const taken = new Set(rec.taken || []), sent = rec.sent || {}, out = [];
  const offs = rec.nags === false ? [0] : OFFSETS; // user can turn nags off in Settings
  for (const m of rec.meds) for (const t of m.times) for (const day of days) for (const off of offs) {
    const el = day.min - t;
    if (el < off || el >= off + 5) continue;        // 5-minute catch-up window if a cron run is late
    const k = `${day.ymd}|${m.id}|${t}`, sk = `${k}|${off}`;
    if (sent[sk] || taken.has(k)) continue;
    out.push({ sk, tag: k,
      title: off === 0 ? `Time for ${m.name}` : `Still need to take ${m.name}?`,
      body: off === 0 ? `Take ${m.perDose} pill${m.perDose > 1 ? 's' : ''}, then open BlovMed and tap I took it.` : 'You have not logged this dose yet.' });
  }
  return out;
}
