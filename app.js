// BlovMed phone app.
import * as C from './core.js';
import * as U from './ui.js';
const { $, esc, today, toast, pl } = U;

const CFG = window.CFG || {};
const WORKER = CFG.worker && !/YOUR_/.test(CFG.worker) ? CFG.worker.replace(/\/$/, '') : '';
const LK = 'blovmed.v2', OLD = 'medmate.v1';
const DEFSET = { accent: 0, car: 0, mode: 'auto', big: false, sound: true, haptics: true, game: true };
const ACC = [['#E8559B', '#FF86BC'], ['#D81B76', '#FF5CA8'], ['#F0728A', '#FF9DB0'], ['#B65FD1', '#D79BF0']], ACCN = ['Bubblegum', 'Hot pink', 'Peach', 'Lavender'];
const CARS = ['#E8559B', '#D62839', '#2E7D32', '#1E5BD8', '#F4B400', '#7B3FE4'], CARN = ['Pink', 'Red', 'Green', 'Blue', 'Yellow', 'Purple'];
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);

/* ---------- storage (moves old data over automatically) ---------- */
let L = load();
function load() {
  try { const x = JSON.parse(localStorage.getItem(LK)); if (x && x.doc) { x.doc = C.merge(x.doc, null); x.set = { ...DEFSET, ...x.set }; return x; } } catch (e) {}
  return migrate();
}
function migrate() {
  let S = null; try { S = JSON.parse(localStorage.getItem(OLD)); } catch (e) {}
  const doc = C.newDoc(), now = Date.now(), out = { doc, dev: null, set: { ...DEFSET }, sub: null };
  if (!S) return out;
  (S.meds || []).forEach((m, i) => {
    doc.meds[m.id] = { id: m.id, c: now + i, name: m.name, perDose: m.perDose || 1, times: m.times || [], sched: m.sched || { type: m.prn ? 'prn' : 'daily' }, start: m.start || null, dur: m.dur || null,
      maxDay: m.maxDay || null, maxPer: m.maxPer || null, minGap: m.minGap || 0, prn: !!m.prn, lib: m.lib, stock0: m.stock || 0, stockAt: now,
      price: m.packSize ? Math.round((m.price || 0) / m.packSize * 100) / 100 : (m.price || 0), purpose: '', notes: '', u: now };
  });
  for (const k in S.log || {}) { const m = doc.meds[k.split('|')[1]]; doc.log[k] = { t: S.log[k], p: m ? m.perDose : 1, u: S.log[k] }; }
  for (const id in S.prn || {}) (S.prn[id] || []).forEach(t => { doc.prn['r' + t + id] = { id, t, p: doc.meds[id] ? doc.meds[id].perDose : 1, u: t }; });
  doc.cfg = { ...doc.cfg, paydays: S.paydays || [15, 30], cur: S.cur || '₱', name: (S.set && S.set.name) || '', nags: !(S.set && S.set.nags === false), u: now };
  for (const id in S.prices || {}) { const p = S.prices[id]; if (p.pr && p.pk) doc.cfg.libPrice[id] = Math.round(p.pr / p.pk * 100) / 100; }
  doc.cfg.ptsBase = Math.max(0, (S.pts || 0) - C.stats(doc, today().ymd).pts);
  if (S.set) for (const k in DEFSET) if (k in S.set) out.set[k] = S.set[k];
  out.sub = S.sub || null;
  return out;
}
const persist = () => { try { localStorage.setItem(LK, JSON.stringify(L)); } catch (e) {} };
const doc = () => L.doc;
const save = () => { persist(); render(); queueSync(); };
const CX = { doc, save };

/* ---------- sync with the worker (also the backup) ---------- */
let syncT, syncing = false, again = false;
const queueSync = (d = 800) => { clearTimeout(syncT); syncT = setTimeout(sync, d); };
async function sync() {
  if (!WORKER || L.moved) return;
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const body = { role: 'phone', doc: L.doc, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, sub: L.sub || null };
    if (L.dev) { body.pid = L.dev.pid; body.key = L.dev.key; }
    const r = await fetch(WORKER + '/p/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 401 && L.dev) { L.moved = true; persist(); render(); return; }
    if (!r.ok) return;
    const j = await r.json();
    if (j.pid) L.dev = { pid: j.pid, key: j.key };
    L.doc = C.merge(L.doc, j.doc); L.meta = j.meta; L.synced = Date.now(); persist();
    if (j.resub) await resubscribe();
    if (!U.sheetOpen() && !busy()) render();
  } catch (e) {} finally { syncing = false; if (again) { again = false; queueSync(300); } }
}
async function api(path, body) {
  const r = await fetch(WORKER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'failed'); return j;
}

/* ---------- push reminders, with a health check every time the app opens ---------- */
let pushState = 'checking';
const b64 = x => { x = x.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(x + '='.repeat((4 - x.length % 4) % 4)), c => c.charCodeAt(0)); };
const subscribe = async reg => (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CFG.vapid) })).toJSON();
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function checkPush() {
  if (!WORKER) { pushState = 'noconfig'; return; }
  if (!canPush()) { pushState = 'unsupported'; return; }
  try {
    const reg = await navigator.serviceWorker.ready, perm = Notification.permission, sub = await reg.pushManager.getSubscription();
    if (perm === 'granted' && sub) {
      const j = sub.toJSON(); pushState = 'on';
      if (!L.sub || L.sub.endpoint !== j.endpoint) { L.sub = j; persist(); queueSync(0); }
    } else if (perm === 'granted' && L.sub) {
      try { L.sub = await subscribe(reg); persist(); queueSync(0); pushState = 'on'; } catch (e) { pushState = 'broken'; }
    } else pushState = L.sub ? (perm === 'denied' ? 'denied' : 'broken') : 'off';
  } catch (e) { pushState = 'broken'; }
  if (!U.sheetOpen() && !busy()) render();
}
async function resubscribe() {
  try { const reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); L.sub = await subscribe(reg); persist(); queueSync(0); }
  catch (e) { pushState = 'broken'; render(); }
}
async function enablePush() {
  if (!WORKER) return alert('The app is not set up yet (config.js).');
  if (!canPush()) return alert(isIOS ? 'On iPhone: tap Share, then Add to Home Screen. Open BlovMed from the new icon and try again.' : 'This browser cannot show reminders. Try Chrome.');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return alert(isIOS ? 'Reminders are blocked. Open iPhone Settings > Notifications > BlovMed and turn on Allow Notifications.' : 'Reminders are blocked. Allow notifications for this app in your phone settings.');
    const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription();
    L.sub = s ? s.toJSON() : await subscribe(reg); pushState = 'on'; persist(); await sync(); render(); toast('Reminders are on 🔔');
  } catch (e) { alert('Could not turn on reminders: ' + e.message); }
}

/* ---------- sound + haptics ---------- */
let AC;
function actx() { if (!L.set.sound) return null; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
function tone(f, t0, d, type, v) { const a = actx(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), n = a.currentTime + t0; o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, n); g.gain.linearRampToValueAtTime(v || .15, n + .02); g.gain.exponentialRampToValueAtTime(.0001, n + d); o.connect(g); g.connect(a.destination); o.start(n); o.stop(n + d + .05); }
function vroom() { const a = actx(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), n = a.currentTime; o.type = 'sawtooth'; o.frequency.setValueAtTime(70, n); o.frequency.exponentialRampToValueAtTime(260, n + .35); o.frequency.exponentialRampToValueAtTime(140, n + .45); o.frequency.exponentialRampToValueAtTime(380, n + .9); g.gain.setValueAtTime(.06, n); g.gain.exponentialRampToValueAtTime(.0001, n + 1); o.connect(g); g.connect(a.destination); o.start(n); o.stop(n + 1.05); }
function screech(at) { const a = actx(); if (!a) return; const len = .75, buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(), g = a.createGain(), n = a.currentTime + at; f.type = 'bandpass'; f.Q.value = 14; f.frequency.setValueAtTime(2300, n); f.frequency.linearRampToValueAtTime(3100, n + .3); f.frequency.linearRampToValueAtTime(2500, n + len); g.gain.setValueAtTime(.0001, n); g.gain.linearRampToValueAtTime(.13, n + .05); g.gain.exponentialRampToValueAtTime(.0001, n + len); s.connect(f); f.connect(g); g.connect(a.destination); s.start(n); s.stop(n + len); }
const sfx = { take() { [523, 659, 784].forEach((f, i) => tone(f, i * .09, .25)); }, undo() { tone(300, 0, .15, 'triangle'); }, win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .1, .35, 'square', .07)); }, honk() { tone(440, 0, .12, 'square', .08); tone(440, .18, .16, 'square', .08); }, tick() { tone(880, 0, .08, 'sine', .08); } };
function buzz(p) {
  if (!L.set.haptics) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(p); return; }
    const l = document.createElement('label'); l.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0';
    const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i); document.body.appendChild(l); l.click(); setTimeout(() => l.remove(), 80);
  } catch (e) {}
}
function pop(t) { const d = document.createElement('div'); d.className = 'pop'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); }

/* ---------- car: fast run + drift when a dose is taken ---------- */
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let animUntil = 0, heroLock = 0;
const busy = () => Date.now() < animUntil || Date.now() < heroLock;
const carSVG = c => `<svg viewBox="0 0 120 60"><rect x="8" y="26" width="104" height="22" rx="9" fill="${c}"/><path d="M30 27 L38 11 H82 L92 27Z" fill="${c}"/><rect x="35" y="7" width="50" height="6" rx="3" fill="#fff"/><path d="M39 25 L44 15 H58 V25Z" fill="#CFE9FF"/><path d="M62 25 V15 H79 L85 25Z" fill="#CFE9FF"/><rect x="58" y="30" width="2" height="12" fill="rgba(0,0,0,.18)"/><rect x="18" y="31" width="5" height="3" rx="1" fill="#fff" opacity=".7"/><circle cx="106" cy="36" r="5.5" fill="#FFF3B0" stroke="#fff" stroke-width="2"/><rect x="8" y="33" width="5" height="7" rx="2" fill="#FF5A5A"/><rect x="100" y="43" width="12" height="4" rx="2" fill="#E8E8E8"/><circle cx="34" cy="49" r="9" fill="#2A2A2A"/><circle cx="34" cy="49" r="4" fill="#CCC"/><circle cx="88" cy="49" r="9" fill="#2A2A2A"/><circle cx="88" cy="49" r="4" fill="#CCC"/></svg>`;
const carX = p => { const sc = $('.scene'); return sc ? 8 + (sc.clientWidth - 130) * p : 0; };
const prog = () => { const ds = C.dosesOn(L.doc, today().ymd); return ds.length ? ds.filter(d => d.at).length / ds.length : 0; };
function placeCar() { const c = $('.car'); if (c && !busy()) c.style.transform = `translateX(${carX(prog())}px)`; }
function carPos() { const sc = $('.scene'), c = $('.car'); return c.getBoundingClientRect().left - sc.getBoundingClientRect().left; }
function puff(x) { const sc = $('.scene'); if (!sc) return; const d = document.createElement('div'); d.className = 'smoke'; d.style.left = (x - 6 + Math.random() * 10) + 'px'; d.style.bottom = (18 + Math.random() * 8) + 'px'; sc.appendChild(d); setTimeout(() => d.remove(), 950); }
function speedo(peak, ms) { const el = $('.speedo'); if (!el) return; const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / ms), v = Math.round(peak * Math.sin(Math.PI * k)); el.textContent = v + ' km/h'; el.style.opacity = k < 1 ? 1 : 0; if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
function drive(p0, p1, win) {
  const sc = $('.scene'), car = $('.car'); if (!sc || !car) return;
  const x0 = carX(p0), x1 = carX(p1), over = Math.max(10, Math.min(46, sc.clientWidth - 100 - x1)), dur = reduce ? 400 : 1600;
  animUntil = Date.now() + dur + (win ? 1500 : 200);
  car.classList.remove('idle'); sc.classList.add('fast'); speedo(win ? 180 : 120, dur);
  const a = car.animate([
    { transform: `translateX(${x0}px) rotate(0deg)`, offset: 0 },
    { transform: `translateX(${x0 - 8}px) rotate(-5deg)`, offset: .12 },                 // launch: nose lifts
    { transform: `translateX(${x1 + over}px) rotate(-2deg)`, offset: .5 },               // full speed
    { transform: `translateX(${x1 + over * .55}px) rotate(14deg)`, offset: .66 },        // drift: tail kicks out
    { transform: `translateX(${x1 - 6}px) rotate(-7deg)`, offset: .83 },                 // counter-steer
    { transform: `translateX(${x1}px) rotate(0deg)`, offset: 1 }], { duration: dur, easing: 'cubic-bezier(.25,.7,.25,1)' });
  car.style.transform = `translateX(${x1}px)`;
  if (!reduce) {
    const sk = document.createElement('div'); sk.className = 'skid'; sk.style.left = (x1 - 10) + 'px'; sk.style.width = (over + 70) + 'px'; sc.appendChild(sk); setTimeout(() => sk.remove(), 1900);
    for (let i = 0; i < 12; i++) setTimeout(() => { if ($('.car')) puff(carPos() + (i % 2 ? 4 : 70)); }, 650 + i * 70);
  }
  vroom(); screech(.95);
  a.onfinish = () => {
    sc.classList.remove('fast'); if (!win) { car.classList.add('idle'); return; }
    const d = car.animate([{ transform: `translateX(${x1}px) rotate(0deg)` }, { transform: `translateX(${x1}px) rotate(720deg)` }], { duration: reduce ? 300 : 1300, easing: 'cubic-bezier(.4,0,.2,1)' });
    screech(0); for (let i = 0; i < 14; i++) setTimeout(() => puff(x1 + 20 + Math.random() * 60), i * 80);
    for (let i = 0; i < 10; i++) { const b = document.createElement('div'); b.className = 'boom'; b.textContent = ['🎉', '✨', '🏆', '💖'][i % 4]; b.style.left = (x1 + 40) + 'px'; b.style.bottom = '50px'; b.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px'); b.style.setProperty('--dy', (-30 - Math.random() * 60) + 'px'); b.style.setProperty('--r', (Math.random() * 90 - 45) + 'deg'); sc.appendChild(b); setTimeout(() => b.remove(), 1150); }
    d.onfinish = () => car.classList.add('idle');
  };
}
function honk() { const sc = $('.scene'), car = $('.car'); if (!sc || !car || busy()) return; sfx.honk(); buzz(30); const x = carPos(); car.animate([{ transform: `translateX(${x}px)` }, { transform: `translateX(${x}px) translateY(-10px)` }, { transform: `translateX(${x}px)` }], { duration: 350 }); const h = document.createElement('div'); h.className = 'honk'; h.textContent = 'Beep beep!'; h.style.left = (x + 50) + 'px'; sc.appendChild(h); setTimeout(() => h.remove(), 900); }

/* ---------- taking doses ---------- */
const now = () => Date.now();
function take(key) {
  const D = L.doc, [d, id, t] = key.split('|'), m = D.meds[id]; if (!m || C.takenAt(D, key) || busy()) return;
  const n = today();
  if (d === n.ymd && C.mins(t) - n.min > 60 && !confirm(`This dose is for ${C.fmtT(t)}. Did you take it now?`)) return;
  if (m.maxDay || m.minGap) { const g = U.guard(D, m); if (g && !confirm(g + '\n\nOnly press OK if your doctor told you to.')) return; }
  const p0 = prog(), ts = now();
  D.log[key] = { t: ts, p: m.perDose, u: ts };
  if (D.snz[key]) D.snz[key] = { until: 0, u: ts };
  const win = d === n.ymd && p0 < 1 && C.dosesOn(D, n.ymd).every(x => x.at), hold = L.set.game ? (reduce ? 800 : win ? 3300 : 1800) : 1500;
  heroLock = ts + hold; persist(); U.closeSheet(); render();
  const p1 = prog();
  sfx.take(); buzz([40, 40, 60]); pop('+10');
  if (L.set.game) drive(p0, p1, win);
  if (win) setTimeout(() => { sfx.win(); buzz([60, 50, 60, 50, 120]); pop('All done! 🏁'); }, 1700);
  setTimeout(render, hold + 60); queueSync();
}
function undo(key) { const D = L.doc, e = D.log[key]; if (!e) return; D.log[key] = { ...e, t: 0, u: now() }; sfx.undo(); buzz(20); U.closeSheet(); save(); }
function snooze(key) { L.doc.snz[key] = { until: now() + 10 * 6e4, u: now() }; buzz(20); toast('Okay! I will remind you in 10 minutes ⏰'); U.closeSheet(); save(); }

/* ---------- Today ---------- */
function status(d, n) { if (d.at) return 'taken'; if (d.d < n.ymd) return 'overdue'; const x = n.min - C.mins(d.t); return x >= 30 ? 'overdue' : x >= 0 ? 'due' : 'upcoming'; }
function lastNight(n) { return n.min < 240 ? C.dosesOn(L.doc, C.addD(n.ymd, -1)).filter(d => !d.at && d.t >= '18:00') : []; }
function pushBanner() {
  if (pushState === 'on' || pushState === 'checking' || pushState === 'noconfig') return '';
  if (pushState === 'unsupported') return isIOS ? `<div class="alert"><i>📲</i><span>Add BlovMed to your Home Screen for reminders<small>Safari: Share → Add to Home Screen, then open it from the icon.</small></span></div>` : '';
  if (pushState === 'denied') return `<div class="alert bad"><i>🔕</i><span>Reminders are blocked<small>${isIOS ? 'iPhone Settings → Notifications → BlovMed → Allow.' : 'Allow notifications for BlovMed in phone settings.'}</small></span></div>`;
  return `<button class="alert ${pushState === 'broken' ? 'bad' : ''}" data-a="perm"><i>🔔</i><span>${pushState === 'broken' ? 'Reminders stopped. Tap to fix' : 'Tap to turn on phone reminders'}<small>So BlovMed can remind you even when it's closed.</small></span></button>`;
}
function shopCard(n) {
  const D = L.doc, p = C.plan(D, n.ymd), low = p.rows.filter(r => r.dl.days <= D.cfg.lowDays);
  const items = C.live(D.shop).filter(s => !s.done || now() - s.done < 6 * 36e5).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.add - b.add);
  if (!low.length && !items.length) return '';
  return `<h2>🛒 To buy</h2><div class="card">
   ${low.map(r => `<button class="check" data-a="buy" data-id="${r.m.id}"><span class="box" style="border-color:var(--bad)">!</span><span class="tx"><b>${esc(r.m.name)}</b> · ${r.dl.days === 0 ? 'out today' : pl(r.dl.days, 'day') + ' left'}<small>${esc(C.buyAdvice(r, p, x => U.money(D, x)))} Tap when you've bought it.</small></span></button>`).join('')}
   ${items.map(s => `<button class="check ${s.done ? 'on' : ''}" data-a="shop" data-id="${s.id}"><span class="box">✓</span><span class="tx">${{ med: '💊', food: '🍌', drink: '🥤' }[s.kind] || '🛍️'} ${esc(s.text)}${s.why ? `<small>For ${esc(s.why)}</small>` : ''}</span></button>`).join('')}</div>`;
}
function prnHtml() {
  const ps = C.medList(L.doc).filter(m => m.prn); if (!ps.length) return '';
  return '<h2>As needed</h2>' + ps.map(m => { const l = C.lastTake(L.doc, m), n = C.pills24(L.doc, m, now()); return `<div class="card"><div class="row"><b>${esc(m.name)}</b><span class="pill ${m.maxDay && n >= m.maxDay ? 'bad' : 'ok'}">${n}${m.maxDay ? ' of ' + m.maxDay : ''} in 24h</span></div><p class="sub" style="margin:4px 0 10px">${l ? 'Last taken ' + U.ago(l) : 'Not taken yet'}${m.notes ? ' · ' + esc(m.notes) : ''}</p><button class="btn full" data-a="prn" data-id="${m.id}">I took ${m.perDose}</button></div>`; }).join('');
}
function viewToday() {
  const D = L.doc, n = today(), ds = C.dosesOn(D, n.ymd), st = C.stats(D, n.ymd), name = D.cfg.name, set = L.set;
  if (!C.medList(D).length) return `<h1>Welcome${name ? ', ' + esc(name) : ''} 💖</h1><p class="sub">Let's add your first medicine. It takes under a minute.</p><button class="btn full big" data-a="new">Add my first medicine</button>${pushBanner()}`;
  const all = [...lastNight(n), ...ds], done = ds.filter(d => d.at).length;
  const act = all.find(d => !d.at && status(d, n) !== 'upcoming'), nxt = all.find(d => !d.at);
  let hero;
  if (now() < heroLock) hero = `<div class="hero done"><small>Logged ✓</small><b>Nice one! +10 ⭐</b></div>`;
  else if (!ds.length && !act) hero = `<div class="hero done"><small>Rest day 😴</small><b>No scheduled doses today.</b></div>`;
  else if (!nxt) hero = `<div class="hero done"><small>${done} of ${ds.length} done</small><b>All done today. Amazing! 🏁</b></div>`;
  else {
    const d = act || nxt, late = act && status(act, n) === 'overdue', z = D.snz[d.key], snoozed = z && z.until > now();
    const label = snoozed ? `Snoozed until ${U.tm(z.until)}` : act ? (late ? (d.d < n.ymd ? 'From last night. Take it now?' : 'Running late. Take it now') : 'Time to take') : 'Next up at ' + C.fmtT(d.t);
    hero = `<div class="hero ${late && !snoozed ? 'late' : ''}"><small>${label}</small><b>${esc(d.m.name)}${d.m.perDose > 1 ? ' ×' + d.m.perDose : ''}</b>
     <span class="meta">${pl(d.m.perDose, 'pill')} · ${C.fmtT(d.t)}${d.m.notes ? ' · ' + esc(d.m.notes) : ''}</span>
     <button data-a="tk" data-k="${d.key}">${act ? 'I took it ✓' : 'I took it early'}</button>
     <div class="two" style="margin-top:8px">${act ? `<button class="ghost" data-a="snz" data-k="${d.key}">⏰ 10 min</button>` : '<span></span>'}<button class="ghost" data-a="dd" data-k="${d.key}">Details</button></div></div>`;
  }
  const scene = set.game ? `<div class="scene" data-a="car" aria-label="Your car. Tap to honk."><div class="road"></div><div class="lines"></div><span class="speedo" style="opacity:0">0 km/h</span><div class="flag">🏁</div><div class="car idle">${carSVG(CARS[set.car])}</div></div>` : '';
  return `<h1>${name ? 'Hi ' + esc(name) + ' 👋' : 'Today'}</h1>
  <div class="chips"><span>⭐ ${st.pts}</span><span>🔥 ${pl(st.streak, 'day')}</span><span>Lv ${st.lvl} · ${st.title}</span></div>
  ${scene}${hero}${pushBanner()}${movedBanner()}${shopCard(n)}${prnHtml()}
  ${all.length ? '<h2>Today\'s doses</h2>' : ''}${all.map(d => { const s = status(d, n); return `<button class="dose ${s}" data-a="dd" data-k="${d.key}"><span class="t">${C.fmtT(d.t)}</span><span class="n">${esc(d.m.name)}<span>${d.at ? 'Taken ' + U.tm(d.at) : pl(d.m.perDose, 'pill') + (d.m.notes ? ' · ' + esc(d.m.notes) : '')}</span>${d.d < n.ymd ? '<em>From last night</em>' : ''}</span><span class="c">✓</span></button>`; }).join('')}`;
}
function movedBanner() { return L.moved ? `<button class="alert bad" data-a="reconnect"><i>⚠️</i><span>This phone is no longer linked<small>BlovMed was moved to another phone or reset. Tap to reconnect this phone (your data stays).</small></span></button>` : ''; }
function doseSheet(key) {
  const D = L.doc, [d, id, t] = key.split('|'), m = D.meds[id]; if (!m) return;
  const at = C.takenAt(D, key), z = D.snz[key];
  U.openSheet(`<h1 style="margin-top:0">${esc(m.name)}</h1><p class="sub">${d === today().ymd ? 'Today' : C.fmtD(d)} at ${C.fmtT(t)} · ${at ? '✅ Taken ' + U.tm(at) : z && z.until > now() ? '⏰ Snoozed until ' + U.tm(z.until) : 'Not taken yet'}</p>
   ${at ? `<button class="btn ghost full" data-a="undo" data-k="${key}">Undo: I didn't take it</button>` : `<button class="btn full big" data-a="tk" data-k="${key}">I took it ✓</button><button class="btn ghost full" style="margin-top:8px" data-a="snz" data-k="${key}">⏰ Remind me in 10 minutes</button>`}
   <div class="card" style="margin-top:14px">${U.medDetails(D, m)}</div>
   <button class="btn ghost full" data-a="edit" data-id="${m.id}">Edit this medicine</button><button class="btn ghost full" style="margin-top:8px" data-a="close">Close</button>`);
}
function medSheet(id) {
  const D = L.doc, m = D.meds[id]; if (!m) return;
  U.openSheet(`<h1 style="margin-top:0">${esc(m.name)}</h1>${m.purpose ? `<p class="sub">For ${esc(m.purpose)}</p>` : ''}<div class="card">${U.medDetails(D, m)}</div>
   ${m.prn ? '' : `<button class="btn full" data-a="buy" data-id="${m.id}">🛒 I bought pills</button>`}
   <button class="btn ghost full" style="margin-top:8px" data-a="edit" data-id="${m.id}">Edit</button><button class="btn ghost full" style="margin-top:8px" data-a="close">Close</button>`);
}

/* ---------- Meds ---------- */
function viewMeds() {
  const D = L.doc, t = today().ymd, ms = C.medList(D), times = [...new Set(ms.flatMap(m => m.times || []))].sort();
  return `<h1>My medicines</h1><p class="sub">Tap one to see everything about it.</p>
  ${ms.map(m => { const st = C.stockOf(D, m), dl = m.prn ? null : C.daysLeft(D, m, t), cls = !dl ? 'ok' : dl.days <= 3 ? 'bad' : dl.days <= 7 ? 'warn' : 'ok', nx = m.prn ? '' : U.nextDose(D, m), course = C.courseText(m, t);
    return `<button class="card" style="width:100%;text-align:left;font:inherit;color:inherit" data-a="med" data-id="${m.id}"><div class="row"><b>💊 ${esc(m.name)}</b><span class="pill ${cls}">${pl(st, 'pill')}${dl && dl.days !== Infinity ? ' · ' + dl.days + 'd' : ''}</span></div>
     <p class="mini" style="margin:6px 0 0">${esc(C.schedText(m))}${course ? ' · ' + course : ''}</p>${m.purpose || m.notes ? `<p class="mini" style="margin:2px 0 0">${esc([m.purpose, m.notes].filter(Boolean).join(' · '))}</p>` : ''}${nx ? `<p class="mini" style="margin:2px 0 0">Next: ${nx}</p>` : ''}</button>`; }).join('') || '<div class="empty">Nothing here yet.</div>'}
  <button class="btn full" data-a="new">+ Add medicine</button>
  ${times.length ? `<details><summary>Backup alarms</summary><p>Extra safety: add repeating alarms in your phone's Clock app at <b>${times.map(C.fmtT).join(' · ')}</b>.</p></details>` : ''}`;
}

/* ---------- Sick ---------- */
let sx = null, pick = {};
function medCard(id) {
  const D = L.doc, L0 = U.LIB[id], pr = (D.cfg.libPrice || {})[id] || 0, c = L0.course, n = U.libPills(id);
  return `<div class="card"><b>${L0.n}</b><p style="margin:6px 0">${L0.per}.</p><p class="sub" style="margin:0 0 10px;font-size:15px">${L0.lim}</p>
  <label style="margin-top:0">Price per ${L0.unit || 'pill'} at your pharmacy (${esc(D.cfg.cur)})</label><input type="number" min="0" step="0.01" data-s="lp:${id}" value="${pr || ''}" placeholder="e.g. 2.50">
  <p style="margin:10px 0" class="mini">${pr ? `1 ${L0.unit || 'pill'} ≈ <b>${U.money(D, pr)}</b>${c ? ` · ${L0.days}-day plan: ${n} pcs ≈ <b>${U.money(D, n * pr)}</b>` : ''}` : 'Type the price to see the cost.'}</p>
  <button class="btn full" data-a="mk" data-id="${id}" data-m="prn">Add: take only when needed</button>
  ${c ? `<button class="btn ghost full" style="margin-top:8px" data-a="mk" data-id="${id}" data-m="course">Add a ${L0.days}-day plan</button>` : ''}</div>`;
}
function buyList(k) {
  const D = L.doc, x = U.SYM[k], items = [];
  x.m.forEach(id => {
    const pr = (D.cfg.libPrice || {})[id] || 0, L0 = U.LIB[id], n = U.libPills(id);
    const mine = C.medList(D).find(m => m.lib === id || m.name === L0.n), have = mine ? C.stockOf(D, mine) : 0, buy = Math.max(0, n - have);
    items.push({ k: 'm:' + id, kind: 'med', text: `${L0.n} × ${buy || n}`, have: !buy, sub: !buy ? `You already have ${have}. Enough for a ${L0.days}-day plan.` : (have ? `You have ${have}. ` : '') + (pr ? '≈ ' + U.money(D, buy * pr) : 'Ask the pharmacist first') });
  });
  x.drink.forEach(t => items.push({ k: 'd:' + t, kind: 'drink', text: t }));
  x.food.forEach(t => items.push({ k: 'f:' + t, kind: 'food', text: t }));
  return items;
}
function viewSick() {
  const D = L.doc, helper = D.cfg.helper, linked = L.meta && L.meta.admins > 0;
  const note = `<div class="alert" style="font-weight:400"><i>ℹ️</i><span>A general label guide for healthy adults, not a diagnosis. You take regular medicines, so ask a pharmacist or your doctor before buying anything new.</span></div>`;
  if (!sx) return `<h1>I don't feel well</h1><p class="sub">Tap what you feel.</p><div class="two">${Object.entries(U.SYM).map(([k, x]) => `<button class="card sym" data-a="sx" data-k="${k}"><span style="font-size:34px">${x.e}</span><br><b>${x.n}</b></button>`).join('')}</div>${note}`;
  const x = U.SYM[sx], li = a => a.map(i => `<li>${i}</li>`).join(''), items = buyList(sx);
  const recent = C.live(D.sick).find(s => s.sym === sx && now() - s.t < 2 * 36e5);
  const open = new Set(C.live(D.shop).filter(s => !s.done).map(s => s.text));
  return `<button class="btn ghost" data-a="sx" data-k="">← Back</button><h1>${x.e} ${x.n}</h1>
  ${recent ? `<div class="alert ok"><i>✅</i><span>Logged ${U.ago(recent.t)}${linked ? `. ${esc(helper || 'Your helper')} can see it.` : '.'}</span></div>` : `<button class="btn full big" data-a="feel">I feel this now</button><p class="mini" style="margin:6px 0 0">${linked ? `Logs it and lets ${esc(helper || 'your helper')} know.` : 'Logs it so you can track how often it happens.'}</p>`}
  <div class="card" style="border-color:var(--bad);margin-top:14px"><b style="color:var(--bad)">🚑 See a doctor or go to the ER if</b><ul>${li(x.dr)}</ul></div>
  <h2>🛒 What to buy</h2><div class="card">${items.map(i => { const inList = open.has(i.text), on = inList || (pick[i.k] ?? !i.have); return `<button class="check ${on ? 'on' : ''}" data-a="pk" data-k="${esc(i.k)}" ${inList ? 'disabled' : ''}><span class="box">✓</span><span class="tx" style="text-decoration:none;color:inherit">${{ med: '💊', food: '🍌', drink: '🥤' }[i.kind]} ${esc(i.text)}<small>${inList ? 'Already on your list' : i.sub || (i.kind === 'food' ? 'Food' : 'Drink')}</small></span></button>`; }).join('')}
   <button class="btn full" style="margin-top:12px" data-a="addshop">Add to my shopping list</button><p class="mini" style="margin:8px 0 0">I'll remind you in 1 hour and again at ${C.fmtT(C.pad(D.cfg.shopHour) + ':00')} until you tick them off.</p></div>
  <h2>💊 Medicine that can help</h2>${x.m.map(medCard).join('')}
  <h2>🍲 Eat and drink</h2><div class="card"><ul>${li(x.eat)}</ul></div>
  <h2>🚫 Avoid</h2><div class="card"><ul>${li(x.avoid)}</ul></div>${note}`;
}

/* ---------- Settings ---------- */
const tog = (k, l, cfg) => { const v = cfg ? L.doc.cfg[k] : L.set[k]; return `<div class="row"><span>${l}</span><div class="opt"><button class="${v ? 'on' : ''}" data-a="${cfg ? 'ctog' : 'tog'}" data-k="${k}">${v ? 'On' : 'Off'}</button></div></div>`; };
function viewSettings() {
  const st = L.set, D = L.doc, o = (k, arr, labels) => arr.map((v, i) => `<button class="${st[k] === v ? 'on' : ''}" data-a="opt" data-k="${k}" data-v='${JSON.stringify(v)}'>${labels[i]}</button>`).join('');
  const linked = L.meta && L.meta.admins > 0, helper = D.cfg.helper || 'your helper';
  const pushTxt = { on: '<span class="pill ok">Phone reminders are on</span>', off: '<button class="btn full" data-a="perm">Turn on phone reminders</button>', broken: '<button class="btn red full" data-a="perm">Reminders stopped. Fix them</button>', denied: '<span class="pill bad">Blocked in phone settings</span>', unsupported: '<span class="pill warn">Add to Home Screen first</span>', noconfig: '<span class="pill warn">Not set up (config.js)</span>', checking: '' }[pushState];
  return `<h1>Settings</h1>
  <div class="card"><label style="margin-top:0">Your name</label><input type="text" data-s="name" value="${esc(D.cfg.name)}" placeholder="What should I call you?"></div>
  <div class="card"><b>🔔 Reminders</b><div style="margin-top:10px">${pushTxt}</div><div style="margin-top:10px">${tog('nags', 'Nudge me again if I forget', 1)}</div></div>
  <div class="card"><b>🎨 Look</b><label>Pink style</label><div class="opt">${o('accent', [0, 1, 2, 3], ACCN)}</div>
  <label>Light or dark</label><div class="opt">${o('mode', ['auto', 'light', 'dark'], ['Auto', 'Light', 'Dark'])}</div><div style="margin-top:12px">${tog('big', 'Bigger text')}</div></div>
  <div class="card"><b>🏎️ Car game</b><div style="margin-top:8px">${tog('game', 'Show the car')}</div>
  <label>Car color</label><div class="opt">${CARS.map((c, i) => `<button class="sw ${st.car === i ? 'on' : ''}" style="background:${c}" aria-label="${CARN[i]}" data-a="opt" data-k="car" data-v="${i}"></button>`).join('')}</div>
  <p class="mini" style="margin:10px 0 0">Every dose = +10 ⭐ and a drift. Finish the day = +20 ⭐ and a victory spin. Tap the car to honk.</p></div>
  <div class="card"><b>🔊 Sound and feel</b><div style="margin-top:8px">${tog('sound', 'Sounds')}</div><div style="margin-top:8px">${tog('haptics', 'Vibration')}</div>
  <button class="btn ghost full" style="margin-top:12px" data-a="test">Test sound and vibration</button><p class="mini" style="margin:8px 0 0">Vibration works best on Android. On iPhone it depends on your iOS version.</p></div>
  <div class="card"><b>💰 Money</b><label>Payday dates</label><div class="two"><input type="number" min="1" max="31" data-s="pd1" value="${D.cfg.paydays[0]}"><input type="number" min="1" max="31" data-s="pd2" value="${D.cfg.paydays[1]}"></div>
  <label>Currency symbol</label><input type="text" maxlength="3" data-s="cur" value="${esc(D.cfg.cur)}"></div>
  ${WORKER ? `<div class="card"><b>🤝 Helper (back office)</b>
   ${linked ? `<p style="margin:8px 0">Linked with <b>${esc(helper)}</b>. They can see your doses, medicines, money plan, sick reports and shopping list, and can edit your medicines.</p><button class="btn ghost full" data-a="code">Show a new link code</button><button class="btn red full" style="margin-top:8px" data-a="unlink">Unlink helper</button>`
    : `<p style="margin:8px 0">Let someone you trust help manage your meds from their own phone. They'll see your doses and can update medicines and prices.</p><button class="btn full" data-a="code">Show link code</button>`}
   <details><summary>Moving from another phone?</summary><p class="mini">Ask your helper for a code (Back office → Settings → Link a new phone), then type it here.</p><input type="text" id="joincode" placeholder="ABCD-EFGH" autocapitalize="characters"><button class="btn full" style="margin-top:8px" data-a="join">Restore my data</button></details>
   <p class="mini" style="margin:10px 0 0">${L.synced ? 'Backed up ' + U.ago(L.synced) : 'Not backed up yet'}</p></div>` : ''}`;
}

/* ---------- render ---------- */
let tab = 'today';
function render() {
  applyTheme();
  $('#app').innerHTML = tab === 'today' ? viewToday() : tab === 'meds' ? viewMeds() : tab === 'money' ? U.moneyHtml(L.doc, false) : tab === 'sick' ? viewSick() : viewSettings();
  $('#nav').innerHTML = [['today', '🏠', 'Today'], ['meds', '💊', 'Meds'], ['sick', '🤒', 'Sick'], ['money', '💰', 'Money'], ['set', '⚙️', 'Settings']].map(([k, i, l]) => `<button data-a="tab" data-k="${k}" class="${tab === k ? 'on' : ''}"><i>${i}</i>${l}</button>`).join('');
  requestAnimationFrame(placeCar);
  const n = today(), late = [...lastNight(n), ...C.dosesOn(L.doc, n.ymd)].filter(d => status(d, n) === 'overdue').length;
  document.title = late ? `(${late}) BlovMed` : 'BlovMed';
}
function applyTheme() {
  const r = document.documentElement, m = L.set.mode;
  if (m === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', m);
  const dark = m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
  r.style.setProperty('--acc', ACC[L.set.accent][dark ? 1 : 0]); r.style.setProperty('--fs', L.set.big ? '21px' : '18px');
}

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, D = L.doc;
  if (U.uiClick(a, b)) return;
  if (a === 'tab') { tab = b.dataset.k; sx = null; render(); window.scrollTo(0, 0); }
  else if (a === 'tk') take(b.dataset.k);
  else if (a === 'undo') undo(b.dataset.k);
  else if (a === 'snz') snooze(b.dataset.k);
  else if (a === 'dd') doseSheet(b.dataset.k);
  else if (a === 'med' || a === 'det') medSheet(b.dataset.id);
  else if (a === 'new') U.openEditor(CX);
  else if (a === 'edit') U.openEditor(CX, b.dataset.id);
  else if (a === 'buy') U.openBuy(CX, b.dataset.id);
  else if (a === 'car') honk();
  else if (a === 'perm') enablePush();
  else if (a === 'tog') { L.set[b.dataset.k] = !L.set[b.dataset.k]; persist(); render(); if (b.dataset.k === 'sound' && L.set.sound) sfx.take(); }
  else if (a === 'ctog') { D.cfg = { ...D.cfg, [b.dataset.k]: !D.cfg[b.dataset.k], u: now() }; save(); }
  else if (a === 'opt') { L.set[b.dataset.k] = JSON.parse(b.dataset.v); persist(); render(); }
  else if (a === 'test') { sfx.take(); vroom(); screech(.5); buzz([40, 40, 60]); pop('+10'); }
  else if (a === 'sx') { sx = b.dataset.k || null; pick = {}; render(); window.scrollTo(0, 0); }
  else if (a === 'mk') U.openEditor(CX, null, U.fromLib(D, b.dataset.id, b.dataset.m));
  else if (a === 'pk') { const k = b.dataset.k; const it = buyList(sx).find(i => i.k === k); pick[k] = !(pick[k] ?? !(it && it.have)); sfx.tick(); render(); }
  else if (a === 'feel') { const id = C.rid('k'), t = now(); D.sick[id] = { id, sym: sx, name: U.SYM[sx].n, t, u: t }; buzz(30); save(); toast('Logged. Feel better soon 💖'); }
  else if (a === 'addshop') {
    const open = new Set(C.live(D.shop).filter(s => !s.done).map(s => s.text)), t = now(); let n = 0;
    for (const i of buyList(sx)) if ((pick[i.k] ?? !i.have) && !open.has(i.text)) { const id = C.rid('s'); D.shop[id] = { id, text: i.text, kind: i.kind, why: U.SYM[sx].n, add: t, done: 0, u: t }; n++; }
    if (!n) return toast('Nothing new to add.');
    sfx.take(); buzz(40); save(); toast(`Added ${pl(n, 'item')} to your list 🛒`);
  }
  else if (a === 'shop') { const s = D.shop[b.dataset.id]; if (!s) return; const t = now(); D.shop[s.id] = { ...s, done: s.done ? 0 : t, u: t }; if (!s.done) { sfx.tick(); buzz(25); } save(); }
  else if (a === 'prn') {
    const m = D.meds[b.dataset.id]; if (!m) return;
    const g = U.guard(D, m); if (g && !confirm(g + '\n\nOnly press OK if your doctor told you to.')) return;
    const id = C.rid('r'), t = now(); D.prn[id] = { id: m.id, t, p: m.perDose, u: t }; sfx.take(); buzz(40); save();
  }
  else if (a === 'code') {
    if (!L.dev) { await sync(); if (!L.dev) return alert('Could not reach the server. Check your internet and try again.'); }
    try { const j = await api('/p/code', { pid: L.dev.pid, key: L.dev.key, role: 'phone' });
      U.openSheet(`<h1 style="margin-top:0">Link code</h1><p>On your helper's phone, open <b>${esc(location.origin + location.pathname.replace(/index\.html$/, ''))}admin.html</b> and type this code:</p><div class="code">${j.code}</div><p class="mini">Works once, for 15 minutes. Only share it with someone you trust.</p><button class="btn full" data-a="close">Done</button>`);
    } catch (e) { alert('Could not get a code. Check your internet.'); }
  }
  else if (a === 'unlink') { if (!confirm('Remove your helper? They will no longer see or edit your meds.')) return; try { const j = await api('/p/unlink', { pid: L.dev.pid, key: L.dev.key, role: 'phone' }); L.meta = j.meta; persist(); render(); toast('Helper removed'); } catch (e) { alert('Could not reach the server.'); } }
  else if (a === 'join') {
    const code = ($('#joincode').value || '').trim(); if (!code) return;
    if (C.medList(D).length && !confirm('This replaces the medicines on this phone with your saved data. Continue?')) return;
    try { const j = await api('/p/claim', { code }); if (j.role !== 'phone') return alert('That code is for the back office page, not for this app.');
      L.dev = { pid: j.pid, key: j.key }; L.doc = C.merge(C.newDoc(), j.doc); L.meta = j.meta; L.moved = false; persist(); await sync(); render(); toast('Your data is back 🎉');
    } catch (e) { alert('That code did not work. Codes last 15 minutes and work once.'); }
  }
  else if (a === 'reconnect') { L.dev = null; L.moved = false; persist(); await sync(); render(); }
});
document.addEventListener('change', ev => {
  if (U.uiChange(ev)) return;
  const k = ev.target.dataset && ev.target.dataset.s; if (!k) return;
  const v = ev.target.value, D = L.doc, t = now();
  if (k.startsWith('lp:')) { const lp = { ...(D.cfg.libPrice || {}), [k.slice(3)]: Math.max(0, parseFloat(v) || 0) }; D.cfg = { ...D.cfg, libPrice: lp, u: t }; save(); return; }
  if (k === 'name') D.cfg = { ...D.cfg, name: v.trim(), u: t };
  else if (k === 'cur') D.cfg = { ...D.cfg, cur: v.trim() || '₱', u: t };
  else if (k === 'pd1' || k === 'pd2') { const pd = [...D.cfg.paydays]; pd[k === 'pd1' ? 0 : 1] = Math.min(31, Math.max(1, parseInt(v) || 15)); D.cfg = { ...D.cfg, paydays: pd, u: t }; }
  save();
});
document.addEventListener('input', U.uiInput);
window.addEventListener('resize', placeCar);

/* ---------- keep fresh ---------- */
let lastDay = today().ymd;
setInterval(() => {
  const d = today().ymd, typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if ((tab === 'today' || d !== lastDay) && !U.sheetOpen() && !busy() && !typing) render();
  lastDay = d;
}, 30000);
setInterval(() => { if (!document.hidden) sync(); }, 5 * 6e4);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkPush(); sync(); if (!U.sheetOpen()) render(); } });

/* ---------- service worker: offline + push + auto-update ---------- */
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !window._reloading) { window._reloading = 1; location.reload(); } });
}
render(); persist(); checkPush(); sync();
