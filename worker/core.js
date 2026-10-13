// BlovMed shared logic. docs/core.js and worker/core.js must stay IDENTICAL.
// No browser or server APIs here, so the app, the back office and the worker all run the same rules.

export const pad = n => String(n).padStart(2, '0');
export const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fmtT = t => { const [h, m] = t.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM'); };
const P = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const F = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
export const addD = (s, n) => F(P(s) + n * 864e5);
export const diffD = (a, b) => Math.round((P(b) - P(a)) / 864e5);
export const wday = s => new Date(P(s)).getUTCDay();
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const fmtD = s => { const [y, m, d] = s.split('-').map(Number); return MO[m - 1] + ' ' + d; };
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local date and minute-of-day in a time zone (undefined = this device).
export function localNow(tz, ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { ymd: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
export const hrs = (first, gap, cnt) => { const b = mins(first), o = []; for (let i = 0; i < cnt; i++) { const x = Math.round(b + i * gap * 60) % 1440; o.push(pad(Math.floor(x / 60)) + ':' + pad(x % 60)); } return o.sort(); };

/* ---------- the shared document ---------- */
// Every record carries u (last changed, ms). Merging keeps the newest copy of each record,
// so the phone and the back office can both edit and always end up with the same data.
export const DEFCFG = { paydays: [15, 30], cur: '₱', lowDays: 4, alertHour: 10, shopHour: 18, nags: true, miss: 60, name: '', helper: '', gift: '', libPrice: {}, libOv: {}, symMeds: {}, ptsBase: 0, resetAt: 0, resetDay: '', model: '', color: -1, u: 0 };
export const newDoc = () => ({ v: 2, gen: 0, act: {}, comp: {}, meds: {}, log: {}, prn: {}, buys: {}, shop: {}, sick: {}, snz: {}, prof: { u: 0 }, cfg: { ...DEFCFG, libPrice: {}, libOv: {}, symMeds: {} } });
const MAPS = ['meds', 'log', 'prn', 'buys', 'shop', 'sick', 'snz', 'act', 'comp'];
const newer = (a, b) => !a || (b.u || 0) > (a.u || 0) || ((b.u || 0) === (a.u || 0) && JSON.stringify(b) > JSON.stringify(a));

export function merge(a, b, now = Date.now()) {
  a = a || newDoc(); b = b || newDoc();
  // A reset in the back office raises gen; the newer generation replaces older data completely.
  const ga = a.gen || 0, gb = b.gen || 0;
  if (ga > gb) b = newDoc(); else if (gb > ga) a = newDoc();
  const o = newDoc(); o.gen = Math.max(ga, gb);
  for (const k of MAPS) {
    const r = {}, A = a[k] || {}, B = b[k] || {};
    for (const id in A) r[id] = A[id];
    for (const id in B) if (newer(r[id], B[id])) r[id] = B[id];
    o[k] = r;
  }
  const ca = a.cfg || {}, cb = b.cfg || {};
  o.cfg = { ...DEFCFG, ...(newer(ca, cb) ? cb : ca) };
  for (const k of ['libPrice', 'libOv', 'symMeds']) o.cfg[k] = { ...(o.cfg[k] || {}) };
  const pa = a.prof || { u: 0 }, pb = b.prof || { u: 0 };
  o.prof = { ...(newer(pa, pb) ? pb : pa) };
  const gma = a.game || {}, gmb = b.game || {}; // game stats: newest wins, but the best score never goes down
  o.game = { ...(newer(gma, gmb) ? gmb : gma) }; o.game.best = Math.max(gma.best || 0, gmb.best || 0);
  prune(o, now);
  return o;
}
function prune(o, now) {
  const day = 864e5, logCut = F(now - 180 * day);
  for (const k in o.log) if (k.slice(0, 10) < logCut) delete o.log[k];
  for (const k in o.prn) if (o.prn[k].t < now - 180 * day) delete o.prn[k];
  for (const k in o.snz) if (o.snz[k].until < now - 2 * day) delete o.snz[k];
  for (const k in o.sick) if (o.sick[k].t < now - 365 * day) delete o.sick[k];
  for (const k in o.buys) if ((o.buys[k].t || 0) < now - 730 * day) delete o.buys[k];
  for (const k in o.shop) { const s = o.shop[k]; if ((s.del || s.done) && s.u < now - 30 * day) delete o.shop[k]; }
  for (const k in o.meds) { const m = o.meds[k]; if (m.del && m.u < now - 365 * day) delete o.meds[k]; }
  const acts = Object.values(o.act).filter(x => x.t > now - 60 * day).sort((x, y) => y.t - x.t).slice(0, 600); o.act = {}; for (const x of acts) o.act[x.id] = x;
}
export const live = o => Object.values(o || {}).filter(x => !x.del);
export const medList = doc => live(doc.meds).sort((a, b) => (a.c || 0) - (b.c || 0));
export const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- schedules ---------- */
export function activeOn(m, d) {
  if (!m || m.del || m.prn) return false;
  const s = m.sched || { type: 'daily' };
  if (m.start && d < m.start) return false;
  const diff = m.start ? diffD(m.start, d) : 0;
  if (m.dur && diff >= m.dur) return false;
  if (s.type === 'everyN') return diff % (s.n || 2) === 0;
  if (s.type === 'weekly') return (s.days || []).includes(wday(d));
  return true;
}
export function timesOn(m, d) {
  if (!activeOn(m, d)) return [];
  const s = m.sched || {}; let t = [...(m.times || [])];
  // "every few hours" plans that wrap past midnight: on the first day, skip times before the first dose.
  if (s.type === 'hours' && m.start === d && s.first) t = t.filter(x => x >= s.first);
  return t.sort();
}
export const dkey = (d, id, t) => d + '|' + id + '|' + t;
export const takenAt = (doc, k) => (doc.log[k] && doc.log[k].t) || 0;
// Follow-up doses: after he takes an as-needed medicine (for example when sick), the next dose is
// planned from the actual time he took it, every f.every hours, never above the 24-hour limit.
export function takesOf(doc, m) {
  const o = [];
  for (const k in doc.log) { const e = doc.log[k]; if (e.t && k.split('|')[1] === m.id) o.push(e.t); }
  for (const k in doc.prn) { const e = doc.prn[k]; if (!e.del && e.id === m.id) o.push(e.t); }
  return o.sort((a, b) => a - b);
}
export function followNext(doc, m) {
  const f = m.follow; if (!f || !f.on || !f.every) return null;
  const takes = takesOf(doc, m), last = takes.length ? takes[takes.length - 1] : f.start;
  let next = last + f.every * 36e5;
  if (m.maxDay && m.perDose) { const k = Math.floor(m.maxDay / m.perDose); const recent = takes.filter(t => t > next - 864e5); if (k > 0 && recent.length >= k) next = Math.max(next, recent[recent.length - k] + 864e5); }
  if (m.minGap) next = Math.max(next, last + m.minGap * 36e5);
  return next > f.end ? null : next;
}
export function dosesOn(doc, d) {
  const o = [];
  for (const m of medList(doc)) for (const t of timesOn(m, d)) { const k = dkey(d, m.id, t); o.push({ key: k, m, t, d, at: takenAt(doc, k) }); }
  for (const m of medList(doc)) {
    if (!m.prn) continue;
    for (const k in doc.log) { const e = doc.log[k], [kd, id, t] = k.split('|'); if (kd === d && id === m.id && e.f && e.t) o.push({ key: k, m, t, d, at: e.t, follow: true }); }
    const nx = followNext(doc, m);
    if (nx) { const ln = localNow(m.follow.tz, nx), t = pad(Math.floor(ln.min / 60)) + ':' + pad(ln.min % 60), k = dkey(ln.ymd, m.id, t); if (ln.ymd === d && !takenAt(doc, k)) o.push({ key: k, m, t, d, at: 0, follow: true, due: nx }); }
  }
  return o.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
}
export function schedText(m) {
  const s = m.sched || { type: 'daily' }, tm = (m.times || []).map(fmtT).join(', ');
  return s.type === 'prn' || m.prn ? 'Only when needed' : s.type === 'everyN' ? `Every ${s.n} days at ${tm}` : s.type === 'weekly' ? `${(s.days || []).map(d => WD[d]).join(', ')} at ${tm}` : s.type === 'hours' ? `Every ${s.gap} hours (${s.cnt}× a day): ${tm}` : `Every day at ${tm}`;
}
export function courseText(m, today) {
  if (!m.dur || !m.start) return '';
  const i = diffD(m.start, today) + 1;
  return i > m.dur ? 'Finished' : i < 1 ? `Starts ${m.start}` : `Day ${i} of ${m.dur}`;
}

/* ---------- stock and money (all per pill) ---------- */
export function stockOf(doc, m) {
  let s = m.stock0 || 0; const at = m.stockAt || 0;
  for (const k in doc.log) { const e = doc.log[k]; if (e.t && e.t > at && k.split('|')[1] === m.id) s -= e.p || m.perDose; }
  for (const k in doc.prn) { const e = doc.prn[k]; if (!e.del && e.id === m.id && e.t > at) s -= e.p || m.perDose; }
  for (const b of live(doc.buys)) if (b.med === m.id && b.t > at) s += b.pills;
  return Math.max(0, s);
}
// Pills needed from day d0 for n days. Doses already taken today are not counted.
export function need(doc, m, d0, n) {
  let x = 0;
  for (let i = 0; i < n; i++) { const d = addD(d0, i); for (const t of timesOn(m, d)) { if (i === 0 && takenAt(doc, dkey(d, m.id, t))) continue; x += m.perDose; } }
  return x;
}
export function daysLeft(doc, m, today) {
  let s = stockOf(doc, m);
  const end = m.dur && m.start ? addD(m.start, m.dur) : null;
  for (let i = 0; i < 400; i++) {
    const d = addD(today, i);
    if (end && d >= end) break;
    for (const t of timesOn(m, d)) { if (i === 0 && takenAt(doc, dkey(d, m.id, t))) continue; s -= m.perDose; if (s < 0) return { days: i, out: d }; }
  }
  return { days: Infinity, out: null };
}
export function paydays(cfg, from, n) {
  const out = [], [y, mo] = from.split('-').map(Number), pd = [...(cfg.paydays || [15, 30])].sort((a, b) => a - b);
  for (let k = -1; k < 4; k++) {
    let yy = y, mm = mo + k; while (mm > 12) { mm -= 12; yy++; } while (mm < 1) { mm += 12; yy--; }
    for (const p of pd) { const d = yy + '-' + pad(mm) + '-' + pad(Math.min(p, dim(yy, mm))); if (d >= from && !out.includes(d)) out.push(d); }
  }
  return out.sort().slice(0, n);
}
export function lastPayday(cfg, today) {
  const ds = paydays(cfg, addD(today, -40), 6).filter(d => d <= today);
  return ds.length ? ds[ds.length - 1] : addD(today, -15);
}
export function plan(doc, today) {
  const [p1, p2] = paydays(doc.cfg, today, 2), toPay = diffD(today, p1), cycle = diffD(p1, p2);
  const rows = medList(doc).filter(m => !m.prn).map(m => {
    const stock = stockOf(doc, m), price = m.price || 0;
    const untilPay = need(doc, m, today, toPay), nowPills = Math.max(0, untilPay - stock);
    const leftAtPay = Math.max(0, stock - untilPay), payPills = Math.max(0, need(doc, m, p1, cycle) - leftAtPay);
    const month = need(doc, m, today, 30);
    return { m, stock, price, nowPills, nowCost: nowPills * price, payPills, payCost: payPills * price, dl: daysLeft(doc, m, today), month, monthCost: month * price };
  });
  const sum = k => rows.reduce((x, r) => x + r[k], 0);
  const since = lastPayday(doc.cfg, today);
  const spent = live(doc.buys).filter(b => (b.d || F(b.t)) >= since).reduce((x, b) => x + (b.cost || 0), 0);
  return { p1, p2, toPay, cycle, rows, nowTotal: sum('nowCost'), payTotal: sum('payCost'), monthTotal: sum('monthCost'), since, spent, noPrice: rows.filter(r => !r.price).map(r => r.m.name) };
}

// One plain sentence on what to buy, used by the app, back office and pushes.
export function buyAdvice(r, p, money) {
  const c = n => r.price ? ` (≈ ${money(n * r.price)})` : '';
  if (r.nowPills) return `Buy at least ${r.nowPills} now${c(r.nowPills)} so you don't run out before payday, ${fmtD(p.p1)}.`;
  if (r.payPills && !p.toPay) return `It's payday! Buy ${r.payPills} today${c(r.payPills)}.`;
  if (r.payPills) return `You're covered until payday. On ${fmtD(p.p1)}, buy ${r.payPills}${c(r.payPills)}.`;
  return 'Running low. Buy more soon.';
}

/* ---------- streaks and points ---------- */
export const sched = (doc, d) => dosesOn(doc, d).filter(x => !x.follow);
export const TITLES = ['Rookie driver', 'Street racer', 'Drift king', 'Road hero', 'Speed star', 'Legend'];
export const PER_LEVEL = 150;
export const titleFor = lvl => TITLES[Math.min(TITLES.length - 1, Math.floor((lvl - 1) / 2))];
// Stars: +10 per dose, +20 per day with every dose taken. A reset (cfg.resetAt/resetDay) starts everything at 0.
export function stats(doc, today) {
  const rAt = doc.cfg.resetAt || 0, rDay = doc.cfg.resetDay || '';
  const perfect = d => { const ds = sched(doc, d); return ds.length ? ds.every(x => x.at && x.at >= rAt) : null; };
  const todayDs = sched(doc, today);
  let streak = perfect(today) ? 1 : 0, pd = 0;
  for (let i = 1; i < 366; i++) { const d = addD(today, -i); if (d < rDay) break; const r = perfect(d); if (r === null) continue; if (r) streak++; else break; }
  for (let i = 0; i < 180; i++) { const d = addD(today, -i); if (d < rDay) break; if (perfect(d)) pd++; }
  const taken = Object.values(doc.log).filter(e => e.t && e.t >= rAt).length;
  const pts = Math.max(0, (doc.cfg.ptsBase || 0) + taken * 10 + pd * 20), lvl = Math.floor(pts / PER_LEVEL) + 1;
  return { streak, pts, lvl, title: titleFor(lvl), into: pts - (lvl - 1) * PER_LEVEL, toNext: lvl * PER_LEVEL - pts, nextTitle: titleFor(lvl + 1),
    left: todayDs.filter(x => !x.at).length, todayTotal: todayDs.length };
}
// Each day: 'full' (all doses), 'part', 'miss' (none), 'rest' (no doses scheduled), 'today' (still going).
export function days(doc, today, n) {
  const rAt = doc.cfg.resetAt || 0, o = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addD(today, -i), ds = sched(doc, d), done = ds.filter(x => x.at && x.at >= rAt).length;
    o.push({ d, total: ds.length, done, st: !ds.length ? 'rest' : done === ds.length ? 'full' : d === today ? 'today' : done ? 'part' : 'miss' });
  }
  return o;
}
export function bestStreak(doc, today) {
  const rDay = doc.cfg.resetDay || ''; let best = 0, cur = 0;
  for (const x of days(doc, today, 180)) { if (x.d < rDay) continue; if (x.st === 'rest' || x.st === 'today') continue; if (x.st === 'full') best = Math.max(best, ++cur); else cur = 0; }
  return Math.max(best, stats(doc, today).streak);
}
// Recent stars earned, newest first.
export function earnings(doc, today, max = 15) {
  const rAt = doc.cfg.resetAt || 0, o = [];
  for (const k in doc.log) { const e = doc.log[k]; if (!e.t || e.t < rAt) continue; const m = doc.meds[k.split('|')[1]]; o.push({ t: e.t, pts: 10, what: (m ? m.name : 'Dose') }); }
  for (const x of days(doc, today, 60)) if (x.st === 'full') { const ds = sched(doc, x.d); o.push({ t: Math.max(...ds.map(y => y.at)), pts: 20, what: 'Perfect day bonus' }); }
  return o.sort((a, b) => b.t - a.t).slice(0, max);
}
export function week(doc, today) {
  const o = [];
  for (let i = 6; i >= 0; i--) { const d = addD(today, -i), ds = sched(doc, d); o.push({ d, total: ds.length, done: ds.filter(x => x.at).length }); }
  return o;
}

/* ---------- safety ---------- */
export function pills24(doc, m, now) {
  const c = now - 864e5; let n = 0;
  for (const k in doc.log) { const e = doc.log[k]; if (e.t > c && k.split('|')[1] === m.id) n += e.p || m.perDose; }
  for (const k in doc.prn) { const e = doc.prn[k]; if (!e.del && e.id === m.id && e.t > c) n += e.p || m.perDose; }
  return n;
}
export function lastTake(doc, m) {
  let l = 0;
  for (const k in doc.log) { const e = doc.log[k]; if (e.t && k.split('|')[1] === m.id) l = Math.max(l, e.t); }
  for (const k in doc.prn) { const e = doc.prn[k]; if (!e.del && e.id === m.id) l = Math.max(l, e.t); }
  return l;
}

/* ---------- what the worker sends, and when ---------- */
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
export function dueReminders(prof, sent, ms, phase = 'cron') {
  const doc = prof.doc, subs = prof.subs || {}, out = [];
  if (!doc) return out;
  const cfg = { ...DEFCFG, ...doc.cfg }, n = localNow(prof.tz || 'Asia/Manila', ms), who = cfg.name || 'He';
  const win = (el, off) => el >= off && el < off + 5; // 5-minute catch-up window if a run is late
  // link = where tapping the alert takes you (#dose=…, #sick=…, #buy, #money, #profile, #act)
  const add = (sk, to, title, body, tag, link = '') => { if (!sent[sk] && subs[to]) out.push({ sk, to, title, body, tag: tag || sk, url: (to === 'admin' ? 'admin.html' : './') + link }); };
  const cur = cfg.cur || '₱', money = x => cur + Math.round(x).toLocaleString('en-US');

  const fresh = t => { const age = ms - t; return phase === 'sync' ? age >= -6e4 && age < 10 * 6e4 : age >= 2 * 6e4 && age < 10 * 6e4; };
  if (phase === 'cron') for (const [d, base] of [[n.ymd, n.min], [addD(n.ymd, -1), n.min + 1440]]) {
    for (const x of dosesOn(doc, d)) {
      if (x.at) continue;
      const el = base - mins(x.t), z = doc.snz[x.key], pills = plural(x.m.perDose, 'pill');
      const how = x.m.notes ? ' ' + x.m.notes + '.' : '';
      if (z && z.until > ms) continue;
      if (z && ms - z.until >= 0 && ms - z.until < 5 * 6e4) add(x.key + '|z' + z.until, 'phone', `Snooze over: ${x.m.name}`, `Take ${pills} now, then tap Take.`, x.key, '#dose=' + x.key);
      for (const off of cfg.nags ? [0, 10, 25] : [0]) if (win(el, off))
        add(x.key + '|' + off, 'phone', off ? `Still need to take ${x.m.name}?` : `Time for ${x.m.name} 💊`, off ? `You haven't logged it yet. Take ${pills}.` : `Take ${pills}.${how} Then tap Take.`, x.key, '#dose=' + x.key);
      if (cfg.miss && win(el, cfg.miss)) add(x.key + '|a', 'admin', `${who} hasn't logged ${x.m.name}`, `It was due at ${fmtT(x.t)} (${cfg.miss} min ago).`, null, '#dose=' + x.key);
    }
  }

  if (phase === 'cron' && win(n.min, (cfg.alertHour ?? 10) * 60)) {
    const p = plan(doc, n.ymd), low = p.rows.filter(r => r.dl.days <= (cfg.lowDays ?? 4));
    if (low.length) {
      const line = r => `${r.m.name}: ${plural(r.dl.days, 'day')} left`;
      add(n.ymd + '|low', 'phone', '🛒 Time to buy meds', low.map(r => `${line(r)}. ${buyAdvice(r, p, money)}`).join(' '), null, '#buy');
      add(n.ymd + '|lowA', 'admin', `${who} is running low`, low.map(line).join(' · '), null, '#buy');
    }
    if (p.p1 === n.ymd && p.payTotal > 0) {
      add(n.ymd + '|pay', 'phone', '💰 Payday! Set aside for meds', `Put aside ${money(p.payTotal)} for your meds until ${fmtD(p.p2)}.`, null, '#money');
      add(n.ymd + '|payA', 'admin', 'Payday med budget', `${who} needs ${money(p.payTotal)} for meds until ${fmtD(p.p2)}.`, null, '#money');
    }
  }

  const open = live(doc.shop).filter(s => !s.done && ms - s.add < 3 * 864e5);
  const batches = {};
  for (const s of open) (batches[s.add] ||= []).push(s.text);
  if (phase === 'cron') for (const t in batches) if (win((ms - +t) / 6e4, 60)) add('shop|' + t, 'phone', '🛒 Reminder: things to buy', batches[t].join(', ') + '. Tick them off in BlovMed when you have them.', null, '#buy');
  if (phase === 'cron' && open.length && win(n.min, (cfg.shopHour ?? 18) * 60)) add(n.ymd + '|shop', 'phone', '🛒 Still on your list', open.map(s => s.text).join(', '), null, '#buy');

  const SEV = ['', 'mild', 'moderate', 'severe'], ST = { better: 'is feeling better', same: 'feels the same', worse: 'is feeling WORSE', gone: 'is better now ✅' };
  for (const s of live(doc.sick)) {
    if (s.by !== 'admin' && fresh(s.t)) add('sick|' + s.id, 'admin', `${s.sev === 3 ? '⚠️ ' : ''}${who} isn't feeling well`, `${s.name || s.sym}${s.sev ? ' (' + SEV[s.sev] + ')' : ''}${s.note ? ': ' + s.note : ''}`, null, '#sick=' + s.id);
    for (const up of s.ups || []) if (up.by !== 'admin' && fresh(up.t)) add('sickU|' + s.id + '|' + up.t, 'admin', `${who} ${ST[up.st] || 'updated a sick log'}`, `${s.name || s.sym}${up.note ? ': ' + up.note : ''}`, null, '#sick=' + s.id);
  }
  for (const s of live(doc.sick)) for (const up of s.ups || []) if (up.by === 'admin' && up.note && fresh(up.t)) add('sickN|' + s.id + '|' + up.t, 'phone', `💌 ${cfg.helper || 'Your helper'} sent you a note`, up.note, null, '#sick=' + s.id);
  const pf = doc.prof || {};
  if (pf.by === 'phone' && fresh(pf.u)) add('prof|' + pf.u, 'admin', `${who} updated his profile`, 'Tap to see the changes.', null, '#profile');
  const added = {};
  for (const s of live(doc.shop)) if (s.by === 'phone' && !s.why && fresh(s.add)) (added[s.add] ||= []).push(s.text);
  for (const t in added) add('shopA|' + t, 'admin', `${who} added to his buy list`, added[t].join(', '), null, '#buy');
  if (cfg.tellTake !== false) for (const k in doc.log) { const e = doc.log[k]; if (e.t && e.by !== 'helper' && fresh(e.t)) { const m = doc.meds[k.split('|')[1]]; add('took|' + k + '|' + e.t, 'admin', `✅ ${who} took ${m ? m.name : 'a dose'}`, `Logged at ${fmtT(pad(Math.floor(localNow(prof.tz || 'Asia/Manila', e.t).min / 60)) + ':' + pad(localNow(prof.tz || 'Asia/Manila', e.t).min % 60))}.`, 'took', '#act'); } }
  return out;
}
