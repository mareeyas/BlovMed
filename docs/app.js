// BlovMed phone app.
import * as C from './core.js';
import * as U from './ui.js';
import { CAR_MODELS, COLORS, COLOR_NAMES, GROUPS, carById } from './cars.js';
import * as G from './game.js';
const { $, esc, today, toast, pl, ask, say } = U;

const CFG = window.CFG || {};
const WORKER = CFG.worker && !/YOUR_/.test(CFG.worker) ? CFG.worker.replace(/\/$/, '') : '';
const LK = 'blovmed.v2', OLD = 'medmate.v1';
const DEFSET = { accent: 0, car: 0, model: 'bubble', mode: 'auto', big: false, sound: true, haptics: true, game: true, guided: false, installSkip: false };
const ACC = [['#E8559B', '#FF86BC'], ['#D81B76', '#FF5CA8'], ['#F0728A', '#FF9DB0'], ['#B65FD1', '#D79BF0']], ACCN = ['Bubblegum', 'Hot pink', 'Peach', 'Lavender'];
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const inAppBrowser = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|MicroMessenger|TikTok/i.test(navigator.userAgent);
let installEvt = null; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });

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
const quiet = () => { persist(); queueSync(300); };
const CX = { doc, save, quiet, render: () => render() };
// The Maestro game gets what it needs from the app: his data, his ride, and his meds status.
function medLine() {
  const n = today(), all = todayDoses(n), late = all.filter(d => !d.at && status(d, n) !== 'upcoming'), nxt = all.find(d => !d.at);
  if (late.length) return late.slice(0, 2).map(d => `<div class="alert bad"><i>💊</i><span>${esc(d.m.name)} ${status(d, n) === 'overdue' ? 'is late' : 'is due now'} (${C.fmtT(d.t)})<small>Take it first, then play.</small></span><button class="mini-btn red" data-a="tk" data-k="${d.key}">Take</button></div>`).join('');
  const shop = C.live(L.doc.shop).filter(x => !x.done).length;
  return (nxt ? `<div class="alert"><i>⏰</i><span>Next: ${esc(nxt.m.name)} at ${C.fmtT(nxt.t)}<small>${pl(all.filter(d => !d.at).length, 'dose')} left today</small></span></div>` : all.length ? '<div class="alert ok"><i>🏁</i><span>All meds done today. Play away!</span></div>' : '')
    + (shop ? `<button class="alert" data-a="tab" data-k="buy"><i>🛒</i><span>${pl(shop, 'thing')} on your buy list</span></button>` : '');
}
G.init({ doc, quiet, act: (ic, t) => U.act(L.doc, ic, t), carSVG: () => carSVG(), isShip: () => isShip(), medLine, honk: () => (isShip() ? shipHorn(0) : sfx.honk()), redraw: () => { const a = $('#app'); if (a && tab === 'game') a.innerHTML = G.view(); } });
U.setCtx(CX, 'phone');

/* ---------- sync with the worker (also the backup) ---------- */
let syncT, syncing = false, again = false;
const typing = () => document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
const queueSync = (d = 300) => { clearTimeout(syncT); syncT = setTimeout(sync, d); };
async function sync() {
  if (!WORKER || L.moved) return;
  if (!L.dev) return;
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const body = { role: 'phone', doc: L.doc, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, sub: L.sub || null, name: devName() };
    if (L.dev) { body.pid = L.dev.pid; body.key = L.dev.key; }
    const r = await fetch(WORKER + '/p/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 401) { signedOut('You were signed out on this device.'); return; }
    if (!r.ok) return;
    const j = await r.json();
    const wasGen = L.doc.gen || 0, before = JSON.stringify(L.doc) + JSON.stringify(L.meta || {});
    L.doc = C.merge(L.doc, j.doc); L.meta = j.meta; L.synced = Date.now();
    const changed = before !== JSON.stringify(L.doc) + JSON.stringify(L.meta || {});
    if ((L.doc.gen || 0) > wasGen) { L.set.guided = false; gs = 0; tab = 'today'; U.closeSheet(); if (document.activeElement) document.activeElement.blur(); persist(); render(); setTimeout(() => toast('Your app was refreshed by ' + (L.doc.cfg.helper || 'your helper') + ' ✨'), 300); }
    persist();
    if (j.resub) await resubscribe();
    if (changed && !U.sheetOpen() && !busy() && !typing()) render();
  } catch (e) {} finally { syncing = false; if (again) { again = false; queueSync(300); } }
}
async function api(path, body) {
  const r = await fetch(WORKER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'failed'); e.status = r.status; e.minutes = j.minutes; throw e; } return j;
}

/* ---------- live connection: the server tells this phone the moment anything changes ---------- */
let ws = null, wsTry = 0, wsTimer = null, live = false;
function connectLive() {
  if (!WORKER || !L.dev || ws) return;
  try { ws = new WebSocket(WORKER.replace(/^http/, 'ws') + `/ws?pid=${L.dev.pid}&key=${L.dev.key}&role=phone`); } catch (e) { return; }
  ws.onopen = () => { wsTry = 0; live = true; sync(); if (!U.sheetOpen() && !typing()) render(); };
  ws.onmessage = e => { if (e.data === 'changed') queueSync(30); };
  ws.onclose = e => { ws = null; live = false; if (e.code === 4001 && L.dev) { signedOut('You were signed out of this device.'); return; } if (L.dev && !document.hidden) { clearTimeout(wsTimer); wsTimer = setTimeout(connectLive, Math.min(30000, 1000 * 2 ** wsTry++)); } };
  ws.onerror = () => {};
}
setInterval(() => { if (ws && ws.readyState === 1) ws.send('ping'); }, 30000);

/* ---------- tapping an alert opens what it is about ---------- */
window.addEventListener('hashchange', () => { if (L.dev && location.hash.length > 1) route(location.hash); });
function route(h) {
  if (!h || !L.dev || !L.set.guided) return;
  const [k, v] = h.replace(/^#/, '').split('='), id = v ? decodeURIComponent(v) : '';
  history.replaceState(null, '', location.pathname); U.closeSheet(true);
  if (k === 'dose') { tab = 'today'; render(); if (L.doc.meds[id.split('|')[1]]) setTimeout(() => doseSheet(id), 60); }
  else if (k === 'sick') { tab = 'sick'; sx = null; render(); if (L.doc.sick[id]) U.openSick(id); }
  else if (k === 'profile') { tab = 'me'; meSeg = 'profile'; render(); }
  else if (k === 'game') { tab = 'game'; G.stop(); render(); }
  else if (['buy', 'money', 'meds', 'today'].includes(k)) { tab = k; render(); }
  window.scrollTo(0, 0);
}

/* ---------- sign in / sign out ---------- */
const devName = () => /iPad/.test(navigator.userAgent) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer';
let loginMsg = '';
async function signIn(user, pin) {
  try {
    const j = await api('/auth/login', { user, pin });
    L.dev = { pid: j.pid, key: j.key }; L.doc = C.merge(C.newDoc(), j.doc); L.meta = j.meta; L.moved = false; L.user = j.meta.user;
    if (L.doc.cfg.model) L.set.model = L.doc.cfg.model;
    U.act(L.doc, '📱', `Signed in on ${devName()}`); persist(); loginMsg = ''; sfx.win(); render(); window.scrollTo(0, 0); queueSync();
    if (window.Notification && Notification.permission === 'granted') checkPush(); else sync();
    connectLive();
    toast(`Welcome${L.doc.cfg.name ? ', ' + L.doc.cfg.name : ''} 💖`);
  } catch (e) {
    say(e.status === 429 ? 'Too many tries' : 'That didn\'t work', e.status === 429 ? `Wait ${e.minutes || 15} minutes, then try again.` : 'Check your username and 6-digit PIN. Ask your helper if you forgot them.', e.status === 429 ? '⏳' : '🔑');
  }
}
async function signOut() {
  if (!(await ask({ icon: '👋', title: 'Sign out?', text: 'Reminders stop on this device. Your data stays safe in your account.', ok: 'Sign out', danger: true }))) return;
  try { await api('/auth/logout', { pid: L.dev.pid, key: L.dev.key, role: 'phone' }); } catch (e) {}
  try { const reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch (e) {}
  signedOut('');
}
function signedOut(msg) { if (ws) { const w = ws; ws = null; w.onclose = null; w.close(); } L = { doc: C.newDoc(), dev: null, set: L.set, sub: null }; loginMsg = msg; persist(); tab = 'today'; U.closeSheet(); render(); }
function viewLogin() {
  return `<div class="guide"><div class="gbody"><div class="gicon">💊</div><h1>Sign in to BlovMed</h1><p class="lead">Use the username and PIN you were given.</p>
   ${loginMsg ? `<div class="alert"><i>ℹ️</i><span>${esc(loginMsg)}</span></div>` : ''}
   <label>Username</label><input type="text" id="li_user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. aaron">
   <label>6-digit PIN</label><input type="password" id="li_pin" class="pinput" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" placeholder="••••••">
   <button class="btn full big" style="margin-top:16px" data-a="signin">Sign in</button>
   <p class="mini" style="text-align:center;margin-top:12px">You stay signed in until you sign out. Use the same sign-in on all your devices.</p></div></div>`;
}
function pinSheet() {
  U.openSheet(`<h1 style="margin-top:0">🔑 Change PIN</h1><p class="sub">Pick 6 digits you'll remember. Not your birthday.</p>
   <label>Current PIN</label><input type="password" id="pn_old" class="pinput" inputmode="numeric" maxlength="6">
   <label>New PIN</label><input type="password" id="pn_new" class="pinput" inputmode="numeric" maxlength="6">
   <label>New PIN again</label><input type="password" id="pn_new2" class="pinput" inputmode="numeric" maxlength="6">
   <div class="sbar"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="pinsave">Save new PIN</button></div>`);
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
  if (!WORKER) return say('Not set up yet', 'The app needs config.js filled in first.', '⚙️');
  if (!canPush()) return say('One step first', isIOS ? 'Add BlovMed to your Home Screen (Share → Add to Home Screen), then open it from the new icon and try again.' : 'This browser cannot show reminders. Try Chrome.', '📲');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return say('Reminders are blocked', isIOS ? 'Open iPhone Settings → Notifications → BlovMed and turn on Allow Notifications.' : 'Allow notifications for BlovMed in your phone settings.', '🔕');
    const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription();
    L.sub = s ? s.toJSON() : await subscribe(reg); pushState = 'on'; U.act(L.doc, '🔔', `Turned on reminders on ${devName()}`); persist(); await sync(); render(); toast('Reminders are on 🔔'); return true;
  } catch (e) { say('Could not turn on reminders', esc(e.message), '😕'); }
}

/* ---------- sound + haptics ---------- */
let AC;
function actx() { if (!L.set.sound) return null; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
function tone(f, t0, d, type, v) { const a = actx(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), n = a.currentTime + t0; o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, n); g.gain.linearRampToValueAtTime(v || .15, n + .02); g.gain.exponentialRampToValueAtTime(.0001, n + d); o.connect(g); g.connect(a.destination); o.start(n); o.stop(n + d + .05); }
function vroom() { const a = actx(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), n = a.currentTime; o.type = 'sawtooth'; o.frequency.setValueAtTime(70, n); o.frequency.exponentialRampToValueAtTime(260, n + .35); o.frequency.exponentialRampToValueAtTime(140, n + .45); o.frequency.exponentialRampToValueAtTime(380, n + .9); g.gain.setValueAtTime(.06, n); g.gain.exponentialRampToValueAtTime(.0001, n + 1); o.connect(g); g.connect(a.destination); o.start(n); o.stop(n + 1.05); }
function screech(at) { const a = actx(); if (!a) return; const len = .75, buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(), g = a.createGain(), n = a.currentTime + at; f.type = 'bandpass'; f.Q.value = 14; f.frequency.setValueAtTime(2300, n); f.frequency.linearRampToValueAtTime(3100, n + .3); f.frequency.linearRampToValueAtTime(2500, n + len); g.gain.setValueAtTime(.0001, n); g.gain.linearRampToValueAtTime(.13, n + .05); g.gain.exponentialRampToValueAtTime(.0001, n + len); s.connect(f); f.connect(g); g.connect(a.destination); s.start(n); s.stop(n + len); }
function shipHorn(at) { const a = actx(); if (!a) return; [98, 147].forEach(f => { const o = a.createOscillator(), g = a.createGain(), n = a.currentTime + at; o.type = 'sawtooth'; o.frequency.value = f; g.gain.setValueAtTime(.0001, n); g.gain.linearRampToValueAtTime(.06, n + .08); g.gain.setValueAtTime(.06, n + .7); g.gain.exponentialRampToValueAtTime(.0001, n + 1); o.connect(g); g.connect(a.destination); o.start(n); o.stop(n + 1.05); }); }
function splash(at) { const a = actx(); if (!a) return; const len = .9, buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(), g = a.createGain(), n = a.currentTime + at; f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(.0001, n); g.gain.linearRampToValueAtTime(.12, n + .15); g.gain.exponentialRampToValueAtTime(.0001, n + len); s.connect(f); f.connect(g); g.connect(a.destination); s.start(n); s.stop(n + len); }
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
const carX = p => { const sc = $('.scene'), c = $('.car'); return sc ? 8 + (sc.clientWidth - (c ? c.offsetWidth : 96) - 34) * p : 0; };
const prog = () => { const ds = C.dosesOn(L.doc, today().ymd); return ds.length ? ds.filter(d => d.at).length / ds.length : 0; };
const vehId = () => (L.doc && L.doc.cfg.model) || L.set.model || 'bubble';
const vehCol = () => { const c = L.doc && L.doc.cfg.color; return c >= 0 ? c : (L.set.car || 0); };
const veh = () => carById(vehId());
const isShip = () => veh().kind === 'ship';
const carSVG = () => veh().draw(COLORS[vehCol()] || COLORS[0]);
function sceneHtml(all) {
  if (!L.set.game) return '';
  const ship = isShip(), n = today(), ds = all || todayDoses(n), k = ds.filter(d => d.at).length, late = ds.some(d => !d.at && status(d, n) === 'overdue');
  const posts = ds.map((d, i) => { const s = i < k ? 'done' : i === k ? (late ? 'late next' : 'next') : '';
    return `<div class="post ${s}" data-i="${i}"><b>${i < k ? '✓' : C.fmtT(d.t).replace(':00', '').replace(' ', '')}</b><i>${i < k ? '✅' : i === ds.length - 1 ? (ship ? '🏝️' : '🏁') : ship ? '🛟' : '🚩'}</i></div>`; }).join('');
  return `<div class="scene ${ship ? 'sea' : ''}" data-a="car" aria-label="Tap to honk">${ship ? '<div class="water"></div>' : '<div class="road"></div>'}<div class="lines"></div><span class="speedo" style="opacity:0"></span>${posts || `<div class="flag">${ship ? '🏝️' : '🏁'}</div>`}<div class="car idle">${carSVG()}</div></div>`;
}
function placeCar() {
  const c = $('.car'), sc = $('.scene'); if (!c || !sc) return;
  const n = today(), ds = todayDoses(n), xs = postXs(sc, c.offsetWidth, ds), posts = document.querySelectorAll('.post');
  const tight = xs.some((x, i) => i && x - xs[i - 1] < 54);
  posts.forEach(p => { const i = +p.dataset.i; p.style.left = xs[i] + 'px'; p.classList.toggle('alt', tight && i % 2 === 1); });
  const k = reached();
  if (!busy()) c.style.transform = `translateX(${k ? xs[k - 1] - c.offsetWidth + 2 : 8}px)`;
}
function carPos() { const sc = $('.scene'), c = $('.car'); return c.getBoundingClientRect().left - sc.getBoundingClientRect().left; }
function puff(x) { const sc = $('.scene'); if (!sc) return; const d = document.createElement('div'); d.className = 'smoke'; d.style.left = (x - 6 + Math.random() * 10) + 'px'; d.style.bottom = (18 + Math.random() * 8) + 'px'; sc.appendChild(d); setTimeout(() => d.remove(), 950); }
function speedo(peak, ms) { const el = $('.speedo'); if (!el) return; const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / ms), v = Math.round(peak * Math.sin(Math.PI * k)); el.textContent = v + (isShip() ? ' knots' : ' km/h'); el.style.opacity = k < 1 ? 1 : 0; if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
function drive(k0, k1, win) {
  const sc = $('.scene'), car = $('.car'); if (!sc || !car) return;
  const ds = todayDoses(today()), xs = postXs(sc, car.offsetWidth, ds), cw = car.offsetWidth;
  const at = k => k <= 0 ? 8 : xs[k - 1] - cw + 2, ship = isShip();
  const S = Math.max(1, k1 - k0), seg = reduce ? 250 : (ship ? 1100 : 900), dur = S * seg;
  animUntil = Date.now() + dur + (win ? 1600 : 250);
  car.classList.remove('idle'); sc.classList.add('fast'); speedo(ship ? (win ? 34 : 27) : (win ? 180 : 120), dur);
  // one hop per flag, in order: the car always reaches the first flag before the next
  const frames = [{ transform: `translateX(${at(k0)}px) rotate(0deg)`, offset: 0 }];
  for (let i = 0; i < S; i++) {
    const a = at(k0 + i), b = at(k0 + i + 1), o = i / S, w = 1 / S;
    frames.push({ transform: `translateX(${a + (b - a) * .55}px) rotate(${ship ? -2 : -4}deg)`, offset: o + w * .4 });
    frames.push({ transform: `translateX(${b + (ship ? 4 : 8)}px) rotate(${ship ? 3 : 11}deg)`, offset: o + w * .78 });
    frames.push({ transform: `translateX(${b}px) rotate(0deg)`, offset: o + w });
  }
  const x1 = at(k1);
  const an = car.animate(frames, { duration: dur, easing: 'ease-in-out' });
  car.style.transform = `translateX(${x1}px)`;
  if (!reduce) for (let i = 0; i < S; i++) {
    const b = at(k0 + i + 1), t0 = (i + .7) * seg;
    setTimeout(() => { const sk = document.createElement('div'); sk.className = 'skid'; sk.style.left = (b - 6) + 'px'; sk.style.width = (cw * .7) + 'px'; sc.appendChild(sk); setTimeout(() => sk.remove(), 1900); for (let j = 0; j < 6; j++) setTimeout(() => puff(b + (j % 2 ? 2 : cw * .6)), j * 60); }, t0);
    setTimeout(() => { if (ship) splash(0); else screech(0); }, t0);
  }
  if (ship) shipHorn(0); else vroom();
  an.onfinish = () => {
    sc.classList.remove('fast'); if (!win) { car.classList.add('idle'); return; }
    if (ship) { shipHorn(0); shipHorn(.9); car.animate([{ transform: `translateX(${x1}px)` }, { transform: `translateX(${x1}px) translateY(-6px) rotate(-3deg)` }, { transform: `translateX(${x1}px) translateY(2px) rotate(2deg)` }, { transform: `translateX(${x1}px)` }], { duration: 1300 }).onfinish = () => car.classList.add('idle'); }
    else { screech(0); car.animate([{ transform: `translateX(${x1}px) rotate(0deg)` }, { transform: `translateX(${x1}px) rotate(720deg)` }], { duration: reduce ? 300 : 1300, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => car.classList.add('idle'); for (let i = 0; i < 12; i++) setTimeout(() => puff(x1 + 10 + Math.random() * 60), i * 80); }
    confetti(sc, x1 + cw / 2);
  };
}
function confetti(sc, x) {
  for (let i = 0; i < 12; i++) { const b = document.createElement('div'); b.className = 'boom'; b.textContent = ['🎉', '✨', '🏆', '💖'][i % 4]; b.style.left = x + 'px'; b.style.bottom = '50px'; b.style.setProperty('--dx', (Math.random() * 180 - 90) + 'px'); b.style.setProperty('--dy', (-30 - Math.random() * 60) + 'px'); b.style.setProperty('--r', (Math.random() * 90 - 45) + 'deg'); sc.appendChild(b); setTimeout(() => b.remove(), 1150); }
}
// Flags are spread evenly along the whole road, one per dose, in time order.
function postXs(sc, cw, ds) {
  const N = ds.length; if (!N) return [];
  const S = cw + 10, R0 = sc.clientWidth - 30;
  return ds.map((_, i) => S + (R0 - S) * (i + 1) / N);
}
// Every dose he logs (in any order) moves the car exactly one flag forward.
const reached = () => todayDoses(today()).filter(d => d.at).length;
function honk() { const sc = $('.scene'), car = $('.car'); if (!sc || !car || busy()) return; if (isShip()) shipHorn(0); else sfx.honk(); buzz(30); const x = carPos(); car.animate([{ transform: `translateX(${x}px)` }, { transform: `translateX(${x}px) translateY(-10px)` }, { transform: `translateX(${x}px)` }], { duration: 350 }); const h = document.createElement('div'); h.className = 'honk'; h.textContent = isShip() ? 'Hoooonk!' : 'Beep beep!'; h.style.left = (x + 50) + 'px'; sc.appendChild(h); setTimeout(() => h.remove(), 900); }

/* ---------- taking doses ---------- */
const now = () => Date.now();
async function take(key) {
  const D = L.doc, [d, id, t] = key.split('|'), m = D.meds[id]; if (!m || C.takenAt(D, key) || busy()) return;
  const n = today();
  if (d === n.ymd && C.mins(t) - n.min > 60 && !(await ask({ icon: '⏰', title: 'Taking it early?', text: `This dose of ${esc(m.name)} is for <b>${C.fmtT(t)}</b>. Only log it if you really took it just now.`, ok: 'Yes, I took it', cancel: 'Not yet' }))) return;
  if ((m.maxDay || m.minGap) && !(await guardOK(D, m))) return;
  if (C.takenAt(D, key) || busy()) return;
  const k0 = reached(), ts = now();
  D.log[key] = { t: ts, p: m.perDose, u: ts, ...(m.prn ? { f: 1 } : {}) };
  U.act(D, '✅', `Took ${m.name} (${C.fmtT(t)} dose)`);
  if (D.snz[key]) D.snz[key] = { until: 0, u: ts };
  const k1 = reached(), all = todayDoses(n), win = k1 === all.length && k1 > k0;
  const hops = Math.max(0, k1 - k0), hold = L.set.game && hops ? (reduce ? 800 : hops * (isShip() ? 1100 : 900) + (win ? 1800 : 400)) : 1500;
  heroLock = ts + hold; persist(); U.closeSheet(); render();
  sfx.take(); buzz([40, 40, 60]); pop('+10');
  if (L.set.game && hops) drive(k0, k1, win);
  if (win) setTimeout(() => { sfx.win(); buzz([60, 50, 60, 50, 120]); pop('All done! 🏁'); }, hold - 1700);
  setTimeout(render, hold + 60); queueSync();
}
// Log an as-needed dose. If the medicine has a repeat interval, plan the next doses on Today automatically.
async function takeAsNeeded(m, sickId) {
  const D = L.doc, t = now(), n = today(), every = m.every || (m.lib && U.LIB[m.lib] && U.LIB[m.lib].every) || 0;
  let follow = m.follow && m.follow.on;
  if (!follow && every) follow = sickId ? true : await ask({ icon: '🔁', title: 'Remind you for the next dose?', text: `I'll add the next ${esc(m.name)} to Today, about every ${every} hours, for up to ${m.followDays || 3} days. It never goes over the safe limit.`, ok: 'Yes, remind me', cancel: 'No thanks' });
  if (follow) {
    const key = C.dkey(n.ymd, m.id, C.pad(Math.floor(n.min / 60)) + ':' + C.pad(n.min % 60));
    D.log[key] = { t, p: m.perDose, u: t, f: 1 };
    if (!(m.follow && m.follow.on)) D.meds[m.id] = { ...m, follow: { on: true, every, start: t, end: t + (m.followDays || 3) * 864e5, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, sick: sickId || '' }, u: t };
    const nx = C.followNext(D, D.meds[m.id]); if (nx) toast(`Next ${m.name} at ${U.tm(nx)} 🔁`);
  } else { const id = C.rid('r'); D.prn[id] = { id: m.id, t, p: m.perDose, u: t }; }
  U.act(D, '💊', `Took ${m.name} (as needed)${sickId ? ' for ' + (D.sick[sickId] ? D.sick[sickId].name : 'feeling sick') : ''}`);
}
async function guardOK(D, m) { const g = U.guard(D, m); return !g || ask({ icon: '✋', title: 'Wait a moment', text: esc(g) + '<br><br>Only continue if your doctor told you to.', ok: 'Doctor said OK', cancel: 'Don\'t take it', danger: true }); }
function undo(key) { const D = L.doc, e = D.log[key]; if (!e) return; D.log[key] = { ...e, t: 0, u: now() }; const um = D.meds[key.split('|')[1]]; U.act(D, '↩️', `Undid ${um ? um.name : 'a dose'}`); sfx.undo(); buzz(20); U.closeSheet(); save(); }
function snooze(key) { L.doc.snz[key] = { until: now() + 10 * 6e4, u: now() }; const sm = L.doc.meds[key.split('|')[1]]; U.act(L.doc, '⏰', `Snoozed ${sm ? sm.name : 'a dose'} 10 min`); buzz(20); toast('Okay! I will remind you in 10 minutes ⏰'); U.closeSheet(); save(); }

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
  const D = L.doc, ps = C.medList(D).filter(m => m.prn); if (!ps.length) return '';
  return '<h2>As needed</h2><div class="list">' + ps.map(m => { const l = C.lastTake(D, m), n = C.pills24(D, m, now()), nx = C.followNext(D, m);
    return `<div class="lrow"><button class="lbody" data-a="med" data-id="${m.id}"><b>${esc(m.name)}</b><span>${l ? 'Last ' + U.ago(l) : 'Not taken yet'}${m.maxDay ? ` · ${n}/${m.maxDay} in 24h` : ''}${nx ? ` · next reminder ${U.tm(nx)}` : ''}</span></button><button class="mini-btn" data-a="prn" data-id="${m.id}">Took ${m.perDose}</button></div>`; }).join('') + '</div>';
}
function todayDoses(n) { return [...lastNight(n), ...C.dosesOn(L.doc, n.ymd)].sort((a, b) => (a.d + a.t < b.d + b.t ? -1 : 1)); }
function viewToday() {
  const D = L.doc, n = today(), st = C.stats(D, n.ymd), name = D.cfg.name, set = L.set;
  if (!C.medList(D).length) return `<h1>Hi${name ? ' ' + esc(name) : ''} 💖</h1><p class="sub">Let's add your first medicine. It takes under a minute.</p>${sceneHtml()}<button class="btn full big" data-a="new">+ Add my first medicine</button>${pushBanner()}`;
  const all = todayDoses(n), nxt = all.find(d => !d.at), late = all.filter(d => !d.at && status(d, n) === 'overdue');
  const line = now() < heroLock ? '<b style="color:var(--ok)">Nice one! +10 ⭐</b>'
    : !all.length ? '😴 Rest day. No doses today.'
    : !nxt ? '🏁 <b>All done today!</b> Amazing.'
    : late.length ? `<b style="color:var(--bad)">⏰ ${esc(late[0].m.name)} is late.</b> Tap Take below.`
    : status(nxt, n) === 'due' ? `<b>💊 Time for ${esc(nxt.m.name)}.</b> Tap Take below.`
    : `Next: <b>${esc(nxt.m.name)}</b> at ${C.fmtT(nxt.t)}${st.left ? ` · ${pl(st.left, 'dose')} to go` : ''}`;
  return `<h1>${name ? 'Hi ' + esc(name) + ' 👋' : 'Today'}</h1>
  <div class="chips"><button data-a="stars">⭐ ${st.pts}</button><button data-a="streak">🔥 ${st.streak}</button><button data-a="level">Lv ${st.lvl} · ${st.title}</button>${set.game ? '<button data-a="garage" aria-label="Garage">🚗</button>' : ''}<button data-a="game" aria-label="Play Maestro">🎹</button></div>
  ${sceneHtml(all)}<p class="status">${line}</p>
  ${!L.set.tip1 && all.length ? `<div class="coach"><span>👋 <b>This is your race for today.</b> Each flag is one dose. Take them in any order: every time you tap <b>Take</b>, your ${isShip() ? 'ship sails' : 'car drives'} to the next flag. Reach the finish to win the day!</span><button class="mini-btn" data-a="tipok">Got it</button></div>` : ''}
  ${all.length ? `<div class="list">${all.map(d => doseRow(d, n, d === nxt)).join('')}</div>` : ''}
  ${streakHint(st)}${pushBanner()}${activeSick()}${buyLink(n)}${prnHtml()}
  <button class="alert game-cta" data-a="game"><i>🎹</i><span>Bored? Play Maestro<small>${G.best() ? `Your best: ${G.best()}. Can you beat it?` : 'A classical music memory game. Play the famous melodies back, note by note.'}</small></span></button>`;
}
function doseRow(d, n, isNext) {
  const s = status(d, n), z = L.doc.snz[d.key], snz = z && z.until > now();
  return `<div class="lrow dose2 ${s}${isNext ? ' next' : ''}"><button class="lbody" data-a="dd" data-k="${d.key}"><span class="t">${C.fmtT(d.t)}</span><span><b>${esc(d.m.name)}</b><span>${d.at ? '✓ Taken ' + U.tm(d.at) : snz ? '⏰ Snoozed until ' + U.tm(z.until) : pl(d.m.perDose, 'pill') + (d.m.notes ? ' · ' + esc(d.m.notes) : '')}${d.follow ? ' · follow-up' : ''}${d.d < n.ymd ? ' · last night' : ''}</span></span></button>
   ${d.at ? `<button class="chk" data-a="dd" data-k="${d.key}" aria-label="Taken">✓</button>` : `<button class="mini-btn ${s === 'overdue' ? 'red' : ''}" data-a="tk" data-k="${d.key}">Take</button>`}</div>`;
}
function streakHint(st) {
  if (!st.todayTotal || !st.left || now() < heroLock) return '';
  return `<p class="mini" style="margin:-6px 0 10px;text-align:center">${st.left === 1 ? 'One more dose today' : st.left + ' more doses today'} to ${st.streak ? 'keep your 🔥 ' + st.streak + '-day streak' : 'start a 🔥 streak'} and earn +20 ⭐</p>`;
}
function buyLink(n) {
  const D = L.doc, p = C.plan(D, n.ymd), cnt = p.rows.filter(r => r.dl.days <= D.cfg.lowDays).length + C.live(D.shop).filter(s => !s.done).length;
  return cnt ? `<button class="alert" data-a="tab" data-k="buy"><i>🛒</i><span>${pl(cnt, 'thing')} to buy<small>Tap to see your buy list.</small></span></button>` : '';
}
function activeSick() {
  const open = C.live(L.doc.sick).filter(s => s.open === true);
  return open.map(s => { const y = U.symOf(s); return `<button class="alert bad" data-a="sickopen" data-id="${s.id}"><i>${y.e}</i><span>How's your ${esc((s.name || y.n).toLowerCase())}?<small>Tap to update your sick log.</small></span></button>`; }).join('');
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
const KIND = { med: '💊', food: '🍌', drink: '🥤', other: '🩹' };
const myLibMed = id => { const n = U.lib(L.doc, id).n; return C.medList(L.doc).find(m => m.lib === id || m.name === n || m.name === U.LIB[id].n); };
function medCard(id) {
  const D = L.doc, L0 = U.lib(D, id), pr = (D.cfg.libPrice || {})[id] || 0, c = L0.course, n = U.libPills(id), mine = myLibMed(id), unit = L0.unit || 'pill';
  return `<div class="card"><div class="row"><b>${esc(L0.n)}</b><button class="btn ghost" style="padding:4px 10px;font-size:13px" data-a="libedit" data-id="${id}">✏️ Edit</button></div>
  <p style="margin:6px 0;font-size:15px">${esc(L0.how || L0.per)}.</p>${L0.mynote ? `<p class="mini" style="margin:0 0 6px">📝 ${esc(L0.mynote)}</p>` : ''}
  <p class="mini" style="margin:0 0 8px">⚠️ ${U.LIB[id].lim}</p>
  <p class="mini" style="margin:0 0 10px">${pr ? `1 ${unit} ≈ <b>${U.money(D, pr)}</b>${c ? ` · ${L0.days}-day plan: ${n} pcs ≈ <b>${U.money(D, n * pr)}</b>` : ''}` : 'Tap Edit to add your pharmacy price.'}</p>
  ${mine ? `<button class="alert ok" data-a="med" data-id="${mine.id}"><i>✅</i><span>In your medicines<small>${pl(C.stockOf(D, mine), unit)} left. Tap for details.</small></span></button>`
    : `<button class="btn full" data-a="mk" data-id="${id}" data-m="prn">Add to my medicines (when needed)</button>${c ? `<button class="btn ghost full" style="margin-top:8px" data-a="mk" data-id="${id}" data-m="course">Add as a ${L0.days}-day plan</button>` : ''}`}</div>`;
}
function libEditSheet(id) {
  const D = L.doc, L0 = U.lib(D, id), pr = (D.cfg.libPrice || {})[id] || '';
  U.openSheet(`<h1 style="margin-top:0">✏️ My version</h1><p class="sub">Make it match the medicine you're used to, like your usual brand.</p>
  <label>Name or brand</label><input type="text" id="le_n" value="${esc(L0.n)}" placeholder="e.g. Biogesic 500 mg">
  <label>How you take it</label><input type="text" id="le_h" value="${esc(L0.how || L0.per)}">
  <label>Price per ${L0.unit || 'pill'} (${esc(D.cfg.cur)})</label><input type="number" min="0" step="0.01" id="le_p" value="${pr}" placeholder="e.g. 2.50">
  <label>My note <span class="mini">(optional)</span></label><input type="text" id="le_note" value="${esc(L0.mynote || '')}" placeholder="e.g. Works best after eating">
  <div class="alert"><i>🔒</i><span>Safety limit stays the same<small>${U.LIB[id].lim}</small></span></div>
  ${D.cfg.libOv && D.cfg.libOv[id] ? `<button class="link" data-a="lereset" data-id="${id}">Go back to the default info</button>` : ''}
  <div class="sbar"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="lesave" data-id="${id}">Save</button></div>`);
}
const usualIds = k => { const D = L.doc, set = (D.cfg.symMeds || {})[k]; return (set || U.SYM[k].m.map(id => myLibMed(id)).filter(Boolean).map(m => m.id)).filter(id => D.meds[id] && !D.meds[id].del); };
function usualHtml(k) {
  const D = L.doc, ids = usualIds(k);
  if (!ids.length) return `<button class="alert" data-a="usual"><i>💊</i><span>Have a medicine you usually take for this?<small>Tap to pick it, so it's here next time.</small></span></button>`;
  return `<h2>💊 Your usual medicine</h2>${ids.map(id => { const m = D.meds[id], n24 = C.pills24(D, m, now());
    return `<div class="card"><div class="row"><b>${esc(m.name)}</b>${m.maxDay ? `<span class="pill ${n24 >= m.maxDay ? 'bad' : 'ok'}">${n24}/${m.maxDay} in 24h</span>` : ''}</div>${m.notes ? `<p class="mini" style="margin:4px 0 0">${esc(m.notes)}</p>` : ''}
    <div class="two" style="margin-top:10px">${m.prn ? `<button class="btn" data-a="prn" data-id="${m.id}">I took ${m.perDose}</button>` : `<button class="btn ghost" data-a="med" data-id="${m.id}">Details</button>`}<button class="btn ghost" data-a="med" data-id="${m.id}">Info</button></div></div>`; }).join('')}
  <button class="link" data-a="usual">Change my usual medicine</button>`;
}
function usualSheet() {
  const D = L.doc, ids = new Set(usualIds(sx)), ms = C.medList(D);
  U.sheetAs('usual'); U.openSheet(`<h1 style="margin-top:0">${U.SYM[sx].e} Usual medicine</h1><p class="sub">What do you usually take for ${esc(U.SYM[sx].n.toLowerCase())}? Tick one or more.</p>
  <div class="card">${ms.map(m => `<button class="check ${ids.has(m.id) ? 'on' : ''}" data-a="usualtog" data-id="${m.id}"><span class="box">✓</span><span class="tx" style="text-decoration:none;color:inherit">${esc(m.name)}<small>${esc(C.schedText(m))}</small></span></button>`).join('') || '<p class="mini">No medicines yet.</p>'}</div>
  <button class="btn ghost full" data-a="usualnew">+ Add a new medicine</button><div class="sbar"><span></span><button class="btn" data-a="close">Done</button></div>`);
}
function buyList(k) {
  const D = L.doc, x = U.SYM[k], items = [];
  x.m.forEach((id, i) => {
    const pr = (D.cfg.libPrice || {})[id] || 0, L0 = U.lib(D, id), n = U.libPills(id), mine = myLibMed(id), have = mine ? C.stockOf(D, mine) : 0, buy = Math.max(0, n - have);
    items.push({ k: 'm:' + id, kind: 'med', text: `${L0.n} × ${buy || n}`, have: !buy || i > 0, sub: !buy ? `You already have ${have}. Enough for now.` : (i > 0 ? 'Another option. ' : '') + (have ? `You have ${have}. ` : '') + (pr ? '≈ ' + U.money(D, buy * pr) : 'Ask the pharmacist first') });
  });
  (x.drink || []).forEach(t => items.push({ k: 'd:' + t, kind: 'drink', text: t, sub: 'Drink' }));
  (x.food || []).forEach(t => items.push({ k: 'f:' + t, kind: 'food', text: t, sub: 'Food' }));
  (x.other || []).forEach(t => items.push({ k: 'o:' + t, kind: 'other', text: t, sub: 'First aid and care' }));
  return items;
}
function viewSick() {
  const D = L.doc, helper = D.cfg.helper || 'your helper';
  const note = `<p class="mini" style="margin-top:14px">ℹ️ A general guide for healthy adults, not a diagnosis. You take regular medicines, so check with a pharmacist or your doctor before buying anything new.</p>`;
  const all = C.live(D.sick).sort((a, b) => b.t - a.t), open = all.filter(s => s.open === true);
  if (!sx) return `<h1>I don't feel well 🤒</h1>
   ${open.length ? `<h2>Right now</h2>${open.map(s => U.sickCard(D, s)).join('')}` : ''}
   <h2>${open.length ? 'Something else?' : 'What do you feel?'}</h2><div class="symgrid">${Object.entries(U.SYM).map(([k, x]) => `<button data-a="sx" data-k="${k}"><i>${x.e}</i>${x.n}</button>`).join('')}<button data-a="logother"><i>✍️</i>Something else</button></div>
   <h2>📖 Logbook</h2>${all.filter(s => s.open !== true).slice(0, logMore ? 100 : 5).map(s => U.sickCard(D, s, true)).join('') || `<p class="mini">${all.length ? 'When something is over, it moves here.' : 'Nothing logged yet. When you log how you feel, it shows up here, and ' + esc(helper) + ' can see it too.'}</p>`}
   ${all.filter(s => s.open !== true).length > 5 && !logMore ? '<button class="link" data-a="logmore">Show all</button>' : ''}${note}`;
  const x = U.SYM[sx], li = a => a.map(i => `<li>${i}</li>`).join(''), items = buyList(sx);
  const cur = open.find(s => s.sym === sx);
  const openTxt = new Set(C.live(D.shop).filter(s => !s.done).map(s => s.text));
  return `<button class="back" data-a="sback">← Back</button><h1>${x.e} ${x.n}</h1>
  ${cur ? U.sickCard(D, cur) : `<button class="btn full big" data-a="logsick" data-k="${sx}">📝 Log it</button><p class="mini" style="margin:6px 0 0;text-align:center">Saves it to your logbook and lets ${esc(helper)} know, so they can help.</p>`}
  <div class="card" style="border-color:var(--bad);margin-top:14px;font-size:15px"><b style="color:var(--bad)">🚑 See a doctor if</b><ul>${li(x.dr)}</ul>${D.prof && D.prof.emphone ? `<p class="mini" style="margin:6px 0 0">Emergency contact: <a href="tel:${esc(D.prof.emphone.replace(/[^\d+]/g, ''))}" style="color:var(--acc);font-weight:700">${esc(D.prof.emname || '')} ${esc(D.prof.emphone)}</a></p>` : ''}</div>
  ${usualHtml(sx)}
  ${items.length ? `<h2>🛒 What to buy</h2><div class="card">${items.map(i => { const inList = openTxt.has(i.text), on = inList || (pick[i.k] ?? !i.have); return `<button class="check ${on ? 'on' : ''}" data-a="pk" data-k="${esc(i.k)}" ${inList ? 'disabled' : ''}><span class="box">✓</span><span class="tx" style="text-decoration:none;color:inherit">${KIND[i.kind]} ${esc(i.text)}<small>${inList ? 'Already on your buy list' : i.sub}</small></span></button>`; }).join('')}
   <button class="btn full" style="margin-top:12px" data-a="addshop">Add to my buy list</button></div>` : ''}
  <details class="sec card"><summary><b>💊 Medicines that can help</b></summary><div>${x.m.length ? x.m.map(medCard).join('') : '<p class="mini">No over-the-counter medicine suggested here. Ask a pharmacist if you need something.</p>'}</div></details>
  <details class="sec card"><summary><b>🍲 Eat and do</b></summary><div><ul>${li(x.eat)}</ul></div></details>
  <details class="sec card"><summary><b>🚫 Avoid</b></summary><div><ul>${li(x.avoid)}</ul></div></details>${note}`;
}
let logMore = false, LS = null;
function logSheet(k) {
  const D = L.doc, x = k ? U.SYM[k] : null, meds = C.medList(D).filter(m => m.prn || (k ? usualIds(k) : []).includes(m.id));
  const extra = x ? x.m.filter(id => U.LIB[id].every && !myLibMed(id)) : [];
  LS = { k, sev: 0, took: {} };
  U.openSheet(`<h1 style="margin-top:0">${x ? x.e + ' ' + x.n : '✍️ How do you feel?'}</h1>
   ${x ? '' : '<label>What is it?</label><input type="text" id="ls_name" placeholder="e.g. Back pain, rash, chills">'}
   <label>How bad is it?</label><div class="opt" id="ls_sev">${[1, 2, 3].map(v => `<button data-a="lssev" data-v="${v}">${U.SEVE[v]} ${U.SEV[v]}</button>`).join('')}</div>
   <label>Anything to add? <span class="mini">(optional)</span></label><textarea id="ls_note" rows="2" placeholder="e.g. Started after lunch, Blov feels a bit dizzy"></textarea>
   ${meds.length + extra.length ? `<label>Did you take something for it just now?</label><div class="card" style="margin:0">${meds.map(m => `<button class="check" data-a="lstook" data-id="${m.id}"><span class="box">✓</span><span class="tx" style="text-decoration:none;color:inherit">${esc(m.name)}<small>${m.perDose} now${(m.every || (m.lib && U.LIB[m.lib] && U.LIB[m.lib].every)) ? ' · next doses go on Today' : ''}</small></span></button>`).join('')}${extra.map(id => `<button class="check" data-a="lstook" data-id="lib:${id}"><span class="box">✓</span><span class="tx" style="text-decoration:none;color:inherit">${esc(U.lib(D, id).n)}<small>Adds it to your medicines · next doses go on Today</small></span></button>`).join('')}</div>` : ''}
   <div class="sbar"><button class="btn ghost" data-a="close">Cancel</button><button class="btn" data-a="lssave">Save to logbook</button></div>`);
}

/* ---------- stars, streak, level: each with its own details ---------- */
function starsSheet() {
  const D = L.doc, n = today().ymd, st = C.stats(D, n), ern = C.earnings(D, n, 12);
  const todayPts = ern.filter(e => U.today().ymd === C.localNow(undefined, e.t).ymd).reduce((x, e) => x + e.pts, 0);
  const wk = ern.filter(e => now() - e.t < 7 * 864e5).reduce((x, e) => x + e.pts, 0);
  U.openSheet(`<h1 style="margin-top:0">⭐ Your stars</h1><div class="bigstat">${st.pts}</div><p>stars in total</p>
   <div class="two"><div class="card" style="text-align:center"><b style="font-size:22px">+${todayPts}</b><br><span class="mini">today</span></div><div class="card" style="text-align:center"><b style="font-size:22px">+${wk}</b><br><span class="mini">last 7 days</span></div></div>
   <div class="card"><b>How to earn</b><div class="howrow"><i>💊</i><span><b>+10</b> for every dose you log</span></div><div class="howrow"><i>🏁</i><span><b>+20</b> when every dose of the day is done</span></div>
   ${st.left ? `<p class="mini" style="margin:8px 0 0">Today you can still earn <b>+${st.left * 10 + 20}</b> ⭐ (${pl(st.left, 'dose')} left).</p>` : ''}</div>
   <div class="card"><b>Recently earned</b>${ern.map(e => `<div class="row mini"><span>${e.pts === 20 ? '🏁' : '💊'} ${esc(e.what)}</span><span>+${e.pts} · ${U.fmtDT(e.t)}</span></div>`).join('') || '<p class="mini">Log your first dose to earn stars.</p>'}</div>`);
}
function streakSheet() {
  const D = L.doc, n = today().ymd, st = C.stats(D, n), best = C.bestStreak(D, n), ds = C.days(D, n, 28);
  const pad = (C.wday(ds[0].d) + 6) % 7, msg = st.left ? (st.streak ? `Take ${pl(st.left, 'more dose')} today to make it ${st.streak + 1} 🔥` : `Take ${st.left === st.todayTotal ? 'all ' + pl(st.left, 'dose') : pl(st.left, 'more dose')} today to start a streak 🔥`) : st.todayTotal ? 'Today is done. Your streak is safe 🔥' : 'Rest day today. Your streak is safe 😴';
  U.openSheet(`<h1 style="margin-top:0">🔥 Your streak</h1><div class="bigstat">${st.streak}</div><p>${st.streak === 1 ? 'day' : 'days'} in a row · best ever: ${best}</p>
   <div class="alert ${st.left ? '' : 'ok'}"><i>${st.left ? '🎯' : '✅'}</i><span>${msg}</span></div>
   <div class="card"><b>Last 4 weeks</b><div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<b>${d}</b>`).join('')}${'<span></span>'.repeat(pad)}${ds.map(x => `<i class="${x.st}${x.d === n ? ' today' : ''}" title="${x.d}">${+x.d.slice(8)}</i>`).join('')}</div>
   <div class="legend"><span style="--c:var(--ok)">All taken</span><span style="--c:var(--warnbg)">Some</span><span style="--c:var(--badbg)">Missed</span><span style="--c:var(--line)">No doses</span></div></div>
   <div class="card"><b>Streak rules</b><div class="howrow"><i>✅</i><span>Take every dose of the day to add 1 day</span></div><div class="howrow"><i>⏰</i><span>Late is fine. It still counts if you log it</span></div><div class="howrow"><i>😴</i><span>Days with no doses don't break it</span></div><div class="howrow"><i>💔</i><span>A day with a missed dose starts it over</span></div></div>`);
}
function levelSheet() {
  const st = C.stats(L.doc, today().ymd), idx = C.TITLES.indexOf(st.title);
  U.openSheet(`<h1 style="margin-top:0">🏆 Your level</h1><div class="bigstat">Lv ${st.lvl}</div><p>${st.title}</p>
   <div class="card"><div class="row"><b>Next: Lv ${st.lvl + 1}</b><span class="mini">${st.toNext} ⭐ to go</span></div><div class="lvl" style="margin:8px 0 0"><b style="width:${Math.round(st.into / C.PER_LEVEL * 100)}%"></b></div>
   <p class="mini" style="margin:6px 0 0">${st.into} of ${C.PER_LEVEL} ⭐ · about ${Math.ceil(st.toNext / 10)} doses</p></div>
   <div class="card"><b>Driver titles</b>${C.TITLES.map((t, i) => `<div class="howrow"><i>${i < idx ? '✅' : i === idx ? '👉' : '🔒'}</i><span><b>${t}</b><small>Level ${i * 2 + 1}${i === C.TITLES.length - 1 ? '+' : '–' + (i * 2 + 2)}${i > idx ? ' · ' + ((i * 2) * C.PER_LEVEL - st.pts) + ' ⭐ away' : ''}</small></span></div>`).join('')}</div>`);
}

/* ---------- Me: profile and settings ---------- */
let meSeg = 'profile', prevTab = 'today';
function viewMe() {
  return `<button class="back" data-a="meback">← Back</button>
   <div class="seg"><button class="${meSeg === 'profile' ? 'on' : ''}" data-a="meseg" data-k="profile">👤 Profile</button><button class="${meSeg === 'set' ? 'on' : ''}" data-a="meseg" data-k="set">⚙️ Settings</button></div>
   ${meSeg === 'profile' ? U.profileHtml(L.doc, false) : viewSettings()}`;
}

/* ---------- welcome guide (first open) ---------- */
let gs = 0;
const GSTEPS = 6;
function howHtml() {
  const st = C.stats(L.doc, today().ymd), idx = C.TITLES.indexOf(st.title);
  return `<div class="card"><div class="row"><b>Lv ${st.lvl} · ${st.title}</b><span class="mini">${st.toNext} ⭐ to Lv ${st.lvl + 1}</span></div><div class="lvl" style="margin:8px 0 0"><b style="width:${Math.round(st.into / C.PER_LEVEL * 100)}%"></b></div><p class="mini" style="margin:6px 0 0">⭐ ${st.pts} stars · 🔥 ${pl(st.streak, 'day')} streak</p></div>
  <div class="card"><div class="howrow"><i>💊</i><span><b>+10 ⭐</b><small>Every dose you log</small></span></div>
   <div class="howrow"><i>🏁</i><span><b>+20 ⭐ bonus</b><small>When every dose of the day is done</small></span></div>
   <div class="howrow"><i>🔥</i><span><b>Streak</b><small>Days in a row with every dose taken. Days with no doses don't break it.</small></span></div>
   <div class="howrow"><i>🏆</i><span><b>Level up every ${C.PER_LEVEL} ⭐</b><small>Your driver title changes every 2 levels.</small></span></div></div>
  <div class="card"><b>Driver titles</b><div class="ttl" style="margin-top:8px">${C.TITLES.map((t, i) => `<span class="${i === idx ? 'on' : ''}">${t}</span>`).join('')}</div></div>
  <p class="mini">💡 Late is okay. A late dose still counts and keeps your streak. Only a missed one breaks it.</p>`;
}
function garageHtml() {
  const cur = vehId(), col = vehCol();
  return GROUPS.map(([g, label]) => `<div class="gh">${label}</div><div class="garage ${g === 'ships' ? 'ships' : ''}">${CAR_MODELS.filter(m => m.group === g).map(m => `<button class="${cur === m.id ? 'on' : ''}" data-a="model" data-v="${m.id}">${m.draw(COLORS[col] || COLORS[0])}<b>${m.name}</b><span>${m.type}</span></button>`).join('')}</div>`).join('')
  + `<div class="gh">🎨 Color${isShip() ? ' (flag and stripe)' : ''}</div><div class="opt">${COLORS.map((c, i) => `<button class="sw ${col === i ? 'on' : ''}" style="background:${c}" aria-label="${COLOR_NAMES[i]}" data-a="color" data-v="${i}"></button>`).join('')}</div>`;
}
const garageSheet = () => { U.sheetAs('garage'); U.openSheet(`<h1 style="margin-top:0">🚗 Garage</h1><p class="sub">Pick your ride. Change it any time.</p>${garageHtml()}<div class="sbar"><span class="mini">Now: <b>${esc(veh().name)}</b></span><button class="btn" data-a="close">Done</button></div>`); };
const shareIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>';
function viewInstall() {
  if (inAppBrowser) return `<div class="guide"><div class="gbody"><div class="gicon">🧭</div><h1>Open in your browser</h1><p class="lead">You opened BlovMed inside another app. Reminders only work from ${isIOS ? 'Safari' : 'Chrome'}.</p>
   <div class="step"><span class="n">1</span><span><b>Tap the ⋯ or ${shareIcon} button</b><span>Usually at the top or bottom of the screen.</span></span></div>
   <div class="step"><span class="n">2</span><span><b>Choose "Open in ${isIOS ? 'Safari' : 'Chrome'}" or "Open in browser"</b></span></div>
   <button class="btn ghost full" data-a="copylink">Or copy the link</button></div><button class="link" data-a="noinstall">Continue here anyway</button></div>`;
  return `<div class="guide"><div class="gbody"><div class="gicon">📲</div><h1>Add BlovMed to your Home Screen</h1><p class="lead">Takes 20 seconds. It's what lets BlovMed remind you.</p>
   <div class="step"><span class="n">1</span><span><b>Tap the Share button ${shareIcon}</b><span>At the bottom of Safari (top on iPad).</span></span></div>
   <div class="step"><span class="n">2</span><span><b>Tap "Add to Home Screen" ➕</b><span>Scroll down a little if you don't see it.</span></span></div>
   <div class="step"><span class="n">3</span><span><b>Tap "Add"</b><span>Top right corner.</span></span></div>
   <div class="step"><span class="n">4</span><span><b>Open BlovMed from your Home Screen 💊</b><span>Then this tab can be closed.</span></span></div>
</div>
   <button class="link" data-a="noinstall">I'll do it later</button></div>`;
}
function viewGuide() {
  const D = L.doc, name = D.cfg.name, helper = D.cfg.helper, ms = C.medList(D);
  const body = [
    () => `<div class="intro"><div class="road"></div><div class="car drivein">${carSVG()}</div><span class="hearts">💖</span></div><h1>Welcome${name ? ', ' + esc(name) : ''}!</h1><p class="lead">BlovMed reminds you to take your meds, plans what to buy, and makes it a little game.</p>
      ${D.cfg.gift ? `<div class="gift"><small>💌 A message from ${esc(helper || 'someone who cares about you')}</small>${esc(D.cfg.gift)}</div>` : ''}
      <label>What should I call you?</label><input type="text" id="g_name" data-s="name" value="${esc(name)}" placeholder="e.g. Aaron, Blov or Beloved">`,
    () => `<div class="gicon">🗓️</div><h1>How it works</h1><p class="lead">Just 1 tap a dose.</p>
      <div class="step"><span class="e">🔔</span><span><b>I remind you</b><span>Even when the app is closed.</span></span></div>
      <div class="step"><span class="e">✅</span><span><b>Tap "I took it"</b><span>One big button. That's it.</span></span></div>
      <div class="step"><span class="e">🏎️</span><span><b>Your car races and drifts</b><span>Every dose moves you to the finish line.</span></span></div>
      <div class="step"><span class="e">🛒</span><span><b>Know what to buy</b><span>I warn you before pills run out and plan it around payday.</span></span></div>`,
    () => `<div class="gicon">⭐</div><h1>Stars and streaks</h1><p class="lead">Keep your streak going to level up.</p>${howHtml()}`,
    () => `<div class="gicon">🚗</div><h1>Pick your ride</h1><p class="lead">You can change it any time in the Garage.</p>${garageHtml()}`,
    () => `<div class="gicon">🔔</div><h1>Turn on reminders</h1><p class="lead">This is the most important step.</p>
      ${pushState === 'on' ? '<div class="alert ok"><i>✅</i><span>Reminders are on. You\'re all set!</span></div>'
        : !canPush() && isIOS ? `<div class="alert"><i>📲</i><span>Add BlovMed to your Home Screen first<small>Safari: ${shareIcon} Share → Add to Home Screen, then open it from the icon.</small></span></div>`
        : `<button class="btn full big" data-a="gperm">Turn on reminders</button><p class="mini" style="text-align:center">Tap <b>Allow</b> when your phone asks.</p>`}
      ${installEvt && !standalone ? '<button class="btn ghost full" style="margin-top:10px" data-a="install">📲 Install BlovMed as an app</button>' : ''}`,
    () => `<div class="gicon">🏁</div><h1>You're ready${name ? ', ' + esc(name) : ''}!</h1>
      ${ms.length ? `<p class="lead">Your medicines are already set up:</p><div class="card">${ms.map(m => `<div class="row"><b>💊 ${esc(m.name)}</b><span class="mini">${esc(C.schedText(m).replace(/^Every day at /, ''))}</span></div>`).join('')}</div>` : '<p class="lead">Next, add your first medicine. It takes under a minute.</p>'}
      <div class="step"><span class="e">🤒</span><span><b>Feeling sick?</b><span>Tap Sick to see what to take, eat and buy.</span></span></div>
      <div class="step"><span class="e">⚙️</span><span><b>Want to change something?</b><span>Everything is in Settings, including this guide.</span></span></div>`,
  ][gs]();
  return `<div class="guide"><div class="gbody" data-step="${gs}">${body}</div>
   <div class="dots">${Array.from({ length: GSTEPS }, (_, i) => `<i class="${i === gs ? 'on' : ''}"></i>`).join('')}</div>
   <div class="gnav">${gs ? '<button class="btn ghost" data-a="gback">← Back</button>' : ''}<button class="btn" data-a="${gs === GSTEPS - 1 ? 'gdone' : 'gnext'}">${gs === GSTEPS - 1 ? (ms.length ? "Let's go! 🏎️" : 'Add my first medicine') : 'Next →'}</button></div>
   ${gs < GSTEPS - 1 ? '<button class="link" data-a="gdone">Skip the guide</button>' : ''}</div>`;
}

/* ---------- Settings ---------- */
const tog = (k, l, cfg) => { const v = cfg ? L.doc.cfg[k] : L.set[k]; return `<div class="row"><span>${l}</span><div class="opt"><button class="${v ? 'on' : ''}" data-a="${cfg ? 'ctog' : 'tog'}" data-k="${k}">${v ? 'On' : 'Off'}</button></div></div>`; };
function viewSettings() {
  const st = L.set, D = L.doc, o = (k, arr, labels) => arr.map((v, i) => `<button class="${st[k] === v ? 'on' : ''}" data-a="opt" data-k="${k}" data-v='${JSON.stringify(v)}'>${labels[i]}</button>`).join('');
  const pushTxt = { on: '<span class="pill ok">On</span>', off: '<button class="mini-btn" data-a="perm">Turn on</button>', broken: '<button class="mini-btn red" data-a="perm">Fix</button>', denied: '<span class="pill bad">Blocked</span>', unsupported: '<span class="pill warn">Add to Home Screen</span>', noconfig: '<span class="pill warn">Not set up</span>', checking: '<span class="mini">Checking…</span>' }[pushState];
  const row = (l, r) => `<div class="srow"><span>${l}</span>${r}</div>`;
  const sw = (k, cfg) => { const v = cfg ? D.cfg[k] : st[k]; return `<button class="toggle ${v ? 'on' : ''}" data-a="${cfg ? 'ctog' : 'tog'}" data-k="${k}" aria-pressed="${!!v}"><i></i></button>`; };
  return `<h1>Settings</h1>
  <div class="list">
   <div class="srow"><span>Name</span><input type="text" data-s="name" data-live="1" value="${esc(D.cfg.name)}" placeholder="e.g. Blov" style="max-width:55%"></div>
   ${row('🔔 Phone reminders', pushTxt)}
   ${row('🔁 Remind me again if I forget', sw('nags', 1))}
   ${row('🚗 My ride', `<button class="mini-btn ghost" data-a="garage">${esc(veh().name)}</button>`)}
   ${row('🏎️ Show the game', sw('game'))}
   ${row('🔊 Sounds', sw('sound'))}
   ${row('📳 Vibration', sw('haptics'))}
   ${row('🔤 Bigger text', sw('big'))}
   ${row('🌙 Dark mode', `<div class="opt">${o('mode', ['auto', 'light', 'dark'], ['Auto', 'Off', 'On'])}</div>`)}
  </div>
  <h2>Account</h2><div class="list">
   ${row(`🔐 @${esc((L.meta && L.meta.user) || L.user || '')}`, `<span class="mini">${L.synced ? 'synced ' + U.ago(L.synced) : ''}</span>`)}
   ${row('🔑 PIN', '<button class="mini-btn ghost" data-a="pin">Change</button>')}
   ${row('👋 Sign out of this device', '<button class="mini-btn ghost" data-a="signout">Sign out</button>')}
  </div>
  <p class="mini">🤝 ${esc(D.cfg.helper || 'Your helper')} can see your medicines, doses, profile, sick logbook and buy list, so they can help you.</p>
  <details class="sec card"><summary><b>More</b></summary><div>
   <label style="margin-top:0">Pink style</label><div class="opt">${o('accent', [0, 1, 2, 3], ACCN)}</div>
   <label>Paydays</label><div class="two"><input type="number" min="1" max="31" data-s="pd1" value="${D.cfg.paydays[0]}"><input type="number" min="1" max="31" data-s="pd2" value="${D.cfg.paydays[1]}"></div>
   <label>Currency</label><input type="text" maxlength="3" data-s="cur" value="${esc(D.cfg.cur)}">
   <button class="btn ghost full" style="margin-top:12px" data-a="test">Test sound and vibration</button>
   ${installEvt && !standalone ? '<button class="btn ghost full" style="margin-top:8px" data-a="install">📲 Install as an app</button>' : ''}
   <button class="btn ghost full" style="margin-top:8px" data-a="guide">Show the welcome guide again</button>
   <button class="btn ghost full" style="margin-top:8px" data-a="reset">Reset my stars and streak</button></div></details>`;
}

/* ---------- render ---------- */
let tab = 'today';
function render() {
  applyTheme();
  const gate = ((isIOS && !standalone) || inAppBrowser) && !L.set.installSkip;
  if (gate || !L.dev || !L.set.guided) {
    $('#nav').innerHTML = '';
    U.keep($('#app'), () => { $('#app').innerHTML = gate ? viewInstall() : !L.dev ? viewLogin() : viewGuide(); });
    return;
  }
  if (tab === 'game') { if (G.playing() && $('#gamebox')) return; $('#app').innerHTML = G.view(); $('#nav').innerHTML = navHtml(); return; }
  const nm = (L.doc.prof && L.doc.prof.full) || L.doc.cfg.name || '';
  U.keep($('#app'), () => { $('#app').innerHTML = (tab === 'me' ? '' : `<button class="avatar top" data-a="me" aria-label="Profile and settings">${esc((nm[0] || '👤').toUpperCase())}</button>`)
    + (tab === 'today' ? viewToday() : tab === 'meds' ? viewMeds() : tab === 'money' ? U.moneyHtml(L.doc, false) : tab === 'sick' ? viewSick() : tab === 'buy' ? U.buyHtml(L.doc, false) : viewMe()); });
  $('#nav').innerHTML = navHtml();
  const _unused = [['today', '🏠', 'Today'], ['meds', '💊', 'Meds'], ['sick', '🤒', 'Sick'], ['buy', '🛒', 'Buy'], ['money', '💰', 'Money']].map(([k, i, l]) => `<button data-a="tab" data-k="${k}" class="${tab === k ? 'on' : ''}"><i>${i}</i>${l}</button>`).join('');
  requestAnimationFrame(placeCar);
  const n = today(), late = [...lastNight(n), ...C.dosesOn(L.doc, n.ymd)].filter(d => status(d, n) === 'overdue').length;
  document.title = late ? `(${late}) BlovMed` : 'BlovMed';
}
const navHtml = () => [['today', '🏠', 'Today'], ['meds', '💊', 'Meds'], ['sick', '🤒', 'Sick'], ['buy', '🛒', 'Buy'], ['money', '💰', 'Money']].map(([k, i, l]) => `<button data-a="tab" data-k="${k}" class="${tab === k ? 'on' : ''}"><i>${i}</i>${l}</button>`).join('');
function applyTheme() {
  const r = document.documentElement, m = L.set.mode;
  if (m === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', m);
  const dark = m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
  r.style.setProperty('--acc', ACC[L.set.accent][dark ? 1 : 0]); r.style.setProperty('--fs', L.set.big ? '18px' : '16px');
}

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b || b.disabled) return;
  const a = b.dataset.a, D = L.doc;
  if (tab === 'game' && G.click(a, b)) return;
  if (U.uiClick(a, b)) return;
  if (await U.v6Click(a, b)) return;
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
  else if (a === 'sx') { sx = b.dataset.k || null; pick = {}; if (sx) U.pushView(); render(); window.scrollTo(0, 0); }
  else if (a === 'sback') U.goBack();
  else if (a === 'signin') { const u = ($('#li_user').value || '').trim(), p = ($('#li_pin').value || '').trim(); if (!u || !/^\d{6}$/.test(p)) return say('Almost', 'Type your username and your 6-digit PIN.', '🔑'); b.disabled = true; await signIn(u, p); b.disabled = false; }
  else if (a === 'signout') signOut();
  else if (a === 'pin') pinSheet();
  else if (a === 'pinsave') {
    const o = $('#pn_old').value, n1 = $('#pn_new').value, n2 = $('#pn_new2').value;
    if (!/^\d{6}$/.test(n1)) return say('6 digits please', 'Your new PIN must be exactly 6 numbers.', '🔑'); if (n1 !== n2) return say("PINs don't match", 'Type the same new PIN twice.', '🔑');
    try { await api('/auth/pin', { pid: L.dev.pid, key: L.dev.key, role: 'phone', old: o, pin: n1 }); U.closeSheet(); U.act(L.doc, '🔑', 'Changed his PIN'); quiet(); toast('PIN changed 🔑'); }
    catch (e) { say(e.status === 403 ? 'Current PIN is wrong' : 'No connection', e.status === 403 ? 'Check your current PIN and try again.' : 'Try again when you are online.', '🔑'); }
  }
  else if (a === 'me') { if (tab !== 'me') prevTab = tab; tab = 'me'; U.pushView(); render(); window.scrollTo(0, 0); }
  else if (a === 'meback' || a === 'gmback') U.goBack();
  else if (a === 'game') { if (tab !== 'game') prevTab = tab; tab = 'game'; G.stop(); U.pushView(); render(); window.scrollTo(0, 0); }
  else if (a === 'meseg') { meSeg = b.dataset.k; render(); }
  else if (a === 'stars') starsSheet();
  else if (a === 'streak') streakSheet();
  else if (a === 'level') levelSheet();
  else if (a === 'logmore') { logMore = true; render(); }
  else if (a === 'logsick') logSheet(b.dataset.k);
  else if (a === 'logother') logSheet(null);
  else if (a === 'lssev') { LS.sev = +b.dataset.v; document.querySelectorAll('#ls_sev button').forEach(x => x.classList.toggle('on', +x.dataset.v === LS.sev)); sfx.tick(); }
  else if (a === 'lstook') { const id = b.dataset.id; LS.took[id] = !LS.took[id]; b.classList.toggle('on', LS.took[id]); }
  else if (a === 'lssave') {
    const k = LS.k, nm2 = k ? U.SYM[k].n : (($('#ls_name') && $('#ls_name').value.trim()) || '');
    if (!nm2) return say('What is it?', 'Type a short name, like "Back pain".', '✍️');
    if (!LS.sev) return say('How bad is it?', 'Tap Mild, Moderate or Severe.', '🤒');
    const t = now(), id = C.rid('k'), took = [];
    D.sick[id] = { id, sym: k || 'other', name: nm2, t, sev: LS.sev, note: '', took: [], ups: [], open: true, by: 'phone', u: t };
    for (const mid of Object.keys(LS.took).filter(x => LS.took[x])) {
      let m = D.meds[mid];
      if (!m && mid.startsWith('lib:')) { const nm = U.fromLib(D, mid.slice(4), 'prn'); delete nm.isNew; nm.c = t; nm.u = t; D.meds[nm.id] = nm; m = nm; }
      if (!m) continue;
      if (!(await guardOK(D, m))) continue;
      if (m.prn) await takeAsNeeded(m, id); else { const r = C.rid('r'); D.prn[r] = { id: m.id, t, p: m.perDose, u: t }; }
      took.push({ t, name: m.name });
    }
    D.sick[id] = { ...D.sick[id], note: ($('#ls_note').value || '').trim(), took, u: now() };
    U.act(D, U.SYM[k] ? U.SYM[k].e : '🤒', `Logged: ${nm2} (${U.SEV[LS.sev].toLowerCase()})`);
    U.closeSheet(); buzz(30); save();
    if (LS.sev === 3) say('Take care 💖', `It's in your logbook and ${esc(D.cfg.helper || 'your helper')} will be told. If it's very bad, see a doctor.${D.prof && D.prof.emphone ? '<br><br>Emergency contact: <a href="tel:' + esc(D.prof.emphone.replace(/[^\d+]/g, '')) + '" style="color:var(--acc);font-weight:700">' + esc(D.prof.emphone) + '</a>' : ''}`, '🚑');
    else toast('Saved to your logbook 📖');
  }
  else if (a === 'howto') U.openSheet(`<h1 style="margin-top:0">⭐ Stars and streaks</h1>${howHtml()}<button class="btn full" data-a="close">Got it</button>`);
  else if (a === 'garage') garageSheet();
  else if (a === 'model' || a === 'color') {
    const D2 = L.doc, t2 = now();
    if (a === 'model') { L.set.model = b.dataset.v; D2.cfg = { ...D2.cfg, model: b.dataset.v, color: vehCol(), u: t2 }; } else { L.set.car = +b.dataset.v; D2.cfg = { ...D2.cfg, model: vehId(), color: +b.dataset.v, u: t2 }; }
    U.act(D2, '🚗', `Picked ${veh().name}`); persist(); queueSync(); if (isShip()) shipHorn(0); else sfx.honk(); buzz(20);
    if (U.sheetOpen()) garageSheet(); else render();
  }
  else if (a === 'gnext') { const n = $('#g_name'); if (n && n.value.trim() !== D.cfg.name) D.cfg = { ...D.cfg, name: n.value.trim(), u: now() }; persist(); gs = Math.min(GSTEPS - 1, gs + 1); U.pushView(); sfx.tick(); render(); window.scrollTo(0, 0); }
  else if (a === 'gback') U.goBack();
  else if (a === 'gperm') { await enablePush(); render(); }
  else if (a === 'gdone') {
    const n = $('#g_name'); if (n && n.value.trim() !== D.cfg.name) D.cfg = { ...D.cfg, name: n.value.trim(), u: now() };
    L.set.guided = true; gs = 0; tab = 'today'; save(); window.scrollTo(0, 0); sfx.win(); buzz([40, 40, 80]);
    requestAnimationFrame(() => { const c = $('.car'), sc = $('.scene'); if (c && sc) { const x = c.style.transform; c.animate([{ transform: 'translateX(-140px)' }, { transform: x }], { duration: reduce ? 200 : 1200, easing: 'cubic-bezier(.2,.8,.2,1)' }); if (isShip()) shipHorn(.2); else vroom(); confetti(sc, sc.clientWidth / 2); } });
    setTimeout(() => toast(`Let's go${D.cfg.name ? ', ' + D.cfg.name : ''}! 🏁`), 500);
    if (!C.medList(D).length) setTimeout(() => U.openEditor(CX), 300);
  }
  else if (a === 'tipok') { L.set.tip1 = true; persist(); render(); }
  else if (a === 'guide') { L.set.guided = false; gs = 0; persist(); render(); window.scrollTo(0, 0); }
  else if (a === 'noinstall') { L.set.installSkip = true; persist(); render(); }
  else if (a === 'install') { if (installEvt) { installEvt.prompt(); installEvt = null; } }
  else if (a === 'copylink') { try { await navigator.clipboard.writeText(location.href); toast('Link copied. Paste it in your browser.'); } catch (e) { say('Copy this link', esc(location.href), '🔗'); } }
  else if (a === 'reset') {
    if (!(await ask({ icon: '🔄', title: 'Start fresh?', text: 'Your stars, level and streak go back to 0. Your medicines and history stay.', ok: 'Reset', danger: true }))) return;
    const t = now(); D.cfg = { ...D.cfg, ptsBase: 0, resetAt: t, resetDay: today().ymd, u: t }; save(); toast('Fresh start! 🏁');
  }
  else if (a === 'libedit') libEditSheet(b.dataset.id);
  else if (a === 'lesave' || a === 'lereset') {
    const id = b.dataset.id, t = now(), ov = { ...(D.cfg.libOv || {}) }, lp = { ...(D.cfg.libPrice || {}) };
    if (a === 'lereset') delete ov[id];
    else { const v = x => ($(x).value || '').trim(); ov[id] = { n: v('#le_n') || U.LIB[id].n, how: v('#le_h'), mynote: v('#le_note') }; const p = parseFloat($('#le_p').value); if (p >= 0) lp[id] = p; }
    D.cfg = { ...D.cfg, libOv: ov, libPrice: lp, u: t }; U.closeSheet(); save(); toast('Saved ✓');
  }
  else if (a === 'usual') usualSheet();
  else if (a === 'usualtog') { const ids = new Set(usualIds(sx)), id = b.dataset.id; ids.has(id) ? ids.delete(id) : ids.add(id); D.cfg = { ...D.cfg, symMeds: { ...(D.cfg.symMeds || {}), [sx]: [...ids] }, u: now() }; persist(); queueSync(); render(); usualSheet(); }
  else if (a === 'usualnew') U.openEditor(CX, null, { ...U.fromLib(D, U.SYM[sx].m[0] || 'para', 'prn'), name: '', lib: undefined, maxDay: null, maxPer: null, minGap: 0, notes: '' });
  else if (a === 'mk') U.openEditor(CX, null, U.fromLib(D, b.dataset.id, b.dataset.m));
  else if (a === 'pk') { const k = b.dataset.k; const it = buyList(sx).find(i => i.k === k); pick[k] = !(pick[k] ?? !(it && it.have)); sfx.tick(); render(); }
  else if (a === 'feel_old') { const id = C.rid('k'), t = now(); D.sick[id] = { id, sym: sx, name: U.SYM[sx].n, t, u: t }; buzz(30); save(); toast('Logged. Feel better soon 💖'); }
  else if (a === 'addshop') {
    const open = new Set(C.live(D.shop).filter(s => !s.done).map(s => s.text)), t = now(); let n = 0;
    for (const i of buyList(sx)) if ((pick[i.k] ?? !i.have) && !open.has(i.text)) { const id = C.rid('s'); D.shop[id] = { id, text: i.text, kind: i.kind, why: U.SYM[sx].n, add: t, done: 0, u: t }; n++; }
    if (!n) return toast('Nothing new to add.');
    sfx.take(); buzz(40); save(); toast(`Added ${pl(n, 'item')} to your list 🛒`);
  }
  else if (a === 'shop') { const s = D.shop[b.dataset.id]; if (!s) return; const t = now(); D.shop[s.id] = { ...s, done: s.done ? 0 : t, u: t }; if (!s.done) { sfx.tick(); buzz(25); } save(); }
  else if (a === 'prn') {
    const m = D.meds[b.dataset.id]; if (!m) return;
    if (!(await guardOK(D, m))) return;
    await takeAsNeeded(m, null); sfx.take(); buzz(40); save();
  }
  else if (a === 'reconnect') { L.dev = null; L.moved = false; persist(); await sync(); render(); }
});
document.addEventListener('change', ev => {
  if (U.uiChange(ev)) return;
  const k = ev.target.dataset && ev.target.dataset.s; if (!k) return;
  const v = ev.target.value, D = L.doc, t = now();
  if (k.startsWith('lp:')) { const lp = { ...(D.cfg.libPrice || {}), [k.slice(3)]: Math.max(0, parseFloat(v) || 0) }; D.cfg = { ...D.cfg, libPrice: lp, u: t }; quiet(); return; }
  if (k === 'name') D.cfg = { ...D.cfg, name: v.trim(), u: t };
  else if (k === 'cur') D.cfg = { ...D.cfg, cur: v.trim() || '₱', u: t };
  else if (k === 'pd1' || k === 'pd2') { const pd = [...D.cfg.paydays]; pd[k === 'pd1' ? 0 : 1] = Math.min(31, Math.max(1, parseInt(v) || 15)); D.cfg = { ...D.cfg, paydays: pd, u: t }; }
  if (k === 'name' || k === 'cur' || k === 'pd1' || k === 'pd2') quiet(); else save();
});
document.addEventListener('input', U.uiInput);
let liveT = null;
document.addEventListener('input', ev => { const el = ev.target; if (!el.dataset || !el.dataset.live) return; clearTimeout(liveT); liveT = setTimeout(() => { if (el.dataset.s === 'name') { L.doc.cfg = { ...L.doc.cfg, name: el.value.trim(), u: now() }; quiet(); } }, 500); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !L.dev && e.target.tagName === 'INPUT') { const b = $('[data-a="signin"]'); if (b) b.click(); } });
U.onBack(() => { if (!L.set.guided) { if (gs > 0) { gs--; render(); } return; } if (tab === 'me' || tab === 'game') { if (tab === 'game') G.stop(); tab = prevTab; render(); return; } if (sx) { sx = null; render(); } });
window.addEventListener('resize', placeCar);

/* ---------- keep fresh ---------- */
let lastDay = today().ymd;
setInterval(() => {
  const d = today().ymd, typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if ((tab === 'today' || d !== lastDay) && !U.sheetOpen() && !busy() && !typing) render();
  lastDay = d;
}, 30000);
setInterval(() => { if (!document.hidden && !live) sync(); }, 12000); // backup when the live connection is down
setInterval(() => { if (!document.hidden) sync(); }, 120000);
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', async e => {
  if (!e.data) return;
  if (e.data.type === 'sync') sync();
  if (e.data.type === 'open') { await sync(); route(new URL(e.data.url).hash); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkPush(); sync(); connectLive(); if (!U.sheetOpen()) render(); } });

/* ---------- service worker: offline + push + auto-update ---------- */
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !window._reloading) { window._reloading = 1; location.reload(); } });
}
render(); persist(); if (L.dev) { checkPush(); connectLive(); const h = location.hash; sync().then(() => route(h)); }
