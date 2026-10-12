// BlovMed back office: the helper's page, synced with all of his devices.
import * as C from './core.js';
import * as U from './ui.js';
const { $, esc, today, toast, pl, ask, say } = U;

const CFG = window.CFG || {};
const WORKER = CFG.worker && !/YOUR_/.test(CFG.worker) ? CFG.worker.replace(/\/$/, '') : '';
const AK = 'blovmed.admin';
let A = null; try { A = JSON.parse(localStorage.getItem(AK)); } catch (e) {}
if (A && A.doc) A.doc = C.merge(A.doc, null);
const persist = () => { try { localStorage.setItem(AK, JSON.stringify(A)); } catch (e) {} };
const doc = () => A.doc;
const save = () => { persist(); render(); queueSync(); };
const CX = { doc, save, render: () => render() };
U.setCtx(CX, 'admin');
const now = () => Date.now();
let tab = 'home', pushOn = false, healthSeg = 'log', loginMode = 'in';
const appLink = () => location.href.replace(/admin\.html.*$/, '').replace(/[#?].*$/, '');

/* ---------- sync ---------- */
let syncT, syncing = false, again = false;
const queueSync = (d = 600) => { clearTimeout(syncT); syncT = setTimeout(sync, d); };
async function api(path, body) {
  const r = await fetch(WORKER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'failed'); e.status = r.status; e.minutes = j.minutes; throw e; } return j;
}
const me = () => ({ pid: A.pid, key: A.key, role: 'admin' });
async function sync() {
  if (!A || !WORKER) return;
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const body = { ...me(), doc: A.doc, name: 'Back office' }; if (A.sendSub !== undefined) body.sub = A.sendSub;
    const j = await api('/p/sync', body);
    delete A.sendSub; A.doc = C.merge(A.doc, j.doc); A.meta = j.meta; A.synced = now(); persist();
    if (!U.sheetOpen() && !typing()) render();
  } catch (e) {
    if (e.status === 401) { A = null; localStorage.removeItem(AK); render(); say('Signed out', 'Please sign in again.', '🔐'); }
  } finally { syncing = false; if (again) { again = false; queueSync(200); } }
}
const typing = () => document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
function signedIn(j) { A = { pid: j.pid, key: j.key, doc: C.merge(C.newDoc(), j.doc), meta: j.meta, synced: now() }; persist(); tab = 'home'; render(); checkPush(); }

/* ---------- my alerts ---------- */
const b64 = x => { x = x.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(x + '='.repeat((4 - x.length % 4) % 4)), c => c.charCodeAt(0)); };
async function checkPush() {
  try { if (!('serviceWorker' in navigator) || !('PushManager' in window)) return; const reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription(); pushOn = !!s && Notification.permission === 'granted';
    if (pushOn && A) { A.sendSub = s.toJSON(); queueSync(0); } } catch (e) {}
}
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return say('Alerts not available here', 'On iPhone, add this page to your Home Screen first. On Android, use Chrome.', '🔔');
  try {
    if (await Notification.requestPermission() !== 'granted') return say('Alerts were blocked', 'Turn on notifications for this site in your phone settings.', '🔕');
    const reg = await navigator.serviceWorker.ready;
    const s = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CFG.vapid) });
    A.sendSub = s.toJSON(); pushOn = true; await sync(); render(); toast('Alerts are on for this device 🔔');
  } catch (e) { say('Could not turn on alerts', esc(e.message), '😕'); }
}

/* ---------- views ---------- */
function viewLogin() {
  const up = loginMode === 'up';
  return `<div class="guide"><div class="gbody"><div class="gicon">💖</div><h1>BlovMed back office</h1><p class="lead">Help manage his medicines from your own phone.</p>
   <div class="seg"><button class="${up ? '' : 'on'}" data-a="lmode" data-k="in">Sign in</button><button class="${up ? 'on' : ''}" data-a="lmode" data-k="up">Create account</button></div>
   <label>Your username</label><input type="text" id="ad_user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. mary">
   <label>Password${up ? ' (at least 8 characters)' : ''}</label><input type="password" id="ad_pass" autocomplete="${up ? 'new-password' : 'current-password'}">
   ${up ? '<label>Password again</label><input type="password" id="ad_pass2" autocomplete="new-password">' : ''}
   <button class="btn full big" style="margin-top:16px" data-a="${up ? 'signup' : 'adlogin'}">${up ? 'Create my back office' : 'Sign in'}</button>
   ${up ? '<p class="mini" style="text-align:center;margin-top:10px">This creates your login and an empty BlovMed for him. Then you set up his medicines and his sign-in.</p>' : ''}
   ${WORKER ? '' : '<div class="alert bad"><i>⚠️</i><span>config.js is not filled in yet.</span></div>'}</div></div>`;
}
function startCard() {
  const D = A.doc, m = A.meta || {}, ms = C.medList(D), ok = x => x ? '✅' : '⬜';
  if (m.user && m.phone && ms.length) return '';
  return `<div class="card" style="border-color:var(--acc)"><b>🎁 Getting his app ready</b>
   <div class="howrow"><i>${ok(D.cfg.name && D.cfg.helper)}</i><span>His name, your name and a welcome message<small>Settings tab</small></span></div>
   <div class="howrow"><i>${ok(ms.length)}</i><span>His medicines, times and prices<small>${ms.length ? pl(ms.length, 'medicine') + ' added' : 'Meds tab'}</small></span></div>
   <div class="howrow"><i>${ok(m.user)}</i><span>His username and PIN<small>${m.user ? '@' + esc(m.user) : 'Settings tab'}</small></span></div>
   <div class="howrow"><i>${ok(m.phone)}</i><span>He signs in on his phone<small>${m.phone ? 'Done' : 'Send him his sign-in'}</small></span></div>
   <button class="btn full" style="margin-top:10px" data-a="${m.user ? 'sendlogin' : 'tab'}" data-k="set">${m.user ? '💌 Send him his sign-in' : 'Set up his sign-in'}</button></div>`;
}
function alertsHtml(D, n) {
  const out = [], who = D.cfg.name || 'He';
  const ds = [...C.dosesOn(D, C.addD(n.ymd, -1)).filter(d => d.t >= '18:00'), ...C.dosesOn(D, n.ymd)];
  for (const d of ds) { if (d.at) continue; const late = (d.d < n.ymd ? n.min + 1440 : n.min) - C.mins(d.t); if (late >= 30 && late < 18 * 60) out.push(['bad', '⏰', `${esc(d.m.name)} not logged`, `Due ${d.d < n.ymd ? 'last night ' : ''}at ${C.fmtT(d.t)} (${late >= 120 ? Math.floor(late / 60) + ' h' : late + ' min'} ago)`, `data-a="dd" data-k="${d.key}"`]); }
  for (const s of C.live(D.sick).filter(s => s.open === true)) { const y = U.symOf(s), st = U.lastSt(s); out.push([st === 'worse' || s.sev === 3 ? 'bad' : '', y.e, `${esc(who)}: ${esc(s.name || y.n)}${s.sev ? ' (' + U.SEV[s.sev].toLowerCase() + ')' : ''}`, `${st ? U.ST[st][1] + ' · ' : ''}since ${U.ago(s.t)}. Tap to see or send a note.`, `data-a="sickopen" data-id="${s.id}"`]); }
  const p = C.plan(D, n.ymd);
  for (const r of p.rows) if (r.dl.days <= D.cfg.lowDays) out.push(['', '🛒', `${esc(r.m.name)}: ${r.dl.days === 0 ? 'out today' : pl(r.dl.days, 'day') + ' left'}`, esc(C.buyAdvice(r, p, x => U.money(D, x))), `data-a="buy" data-id="${r.m.id}"`]);
  if (p.noPrice.length) out.push(['', '✏️', 'Missing prices', `Add a price per pill for ${esc(p.noPrice.join(', '))}`, `data-a="tab" data-k="meds"`]);
  const open = C.live(D.shop).filter(s => !s.done);
  if (open.length) out.push(['', '🧺', `${pl(open.length, 'item')} on his buy list`, open.slice(0, 6).map(s => esc(s.text)).join(', '), `data-a="tab" data-k="buy"`]);
  if (D.prof && D.prof.by === 'phone' && now() - D.prof.u < 3 * 864e5) out.push(['', '👤', `${esc(who)} updated his profile`, U.ago(D.prof.u), `data-a="health" data-k="profile"`]);
  const m = A.meta || {};
  if (m.phone && !m.subs.phone) out.push(['bad', '🔕', 'Reminders are off on his devices', 'Ask him to open BlovMed and tap "Turn on phone reminders".', '']);
  if (m.seen && m.seen.phone && now() - m.seen.phone > 2 * 864e5) out.push(['', '📵', "His app hasn't synced in a while", 'Last seen ' + U.ago(m.seen.phone) + '.', '']);
  return out.length ? out.map(([c, i, t, s, at]) => `<button class="alert ${c}" ${at}><i>${i}</i><span>${t}<small>${s}</small></span></button>`).join('') : '<div class="alert ok"><i>✅</i><span>All good right now.</span></div>';
}
function viewHome() {
  const D = A.doc, n = today(), ds = C.dosesOn(D, n.ymd), st = C.stats(D, n.ymd), wk = C.week(D, n.ymd), p = C.plan(D, n.ymd), who = D.cfg.name || 'Him', m = A.meta || {};
  const s = d => d.at ? `<span class="pill ok">✓ ${U.tm(d.at)}</span>` : (n.min - C.mins(d.t) >= 30 ? '<span class="pill bad">Not logged</span>' : n.min >= C.mins(d.t) ? '<span class="pill warn">Due now</span>' : '<span class="pill">Later</span>');
  return `<h1>${esc(who)}'s meds</h1><p class="sub">${m.seen && m.seen.phone ? 'His app synced ' + U.ago(m.seen.phone) : m.phone ? 'Waiting for his app to sync' : 'Not signed in on his phone yet'} · <a href="#" data-a="refresh" style="color:var(--acc)">refresh</a></p>
  ${startCard()}<h2>Needs attention</h2>${alertsHtml(D, n)}
  <h2>Today · ${ds.filter(d => d.at).length} of ${ds.length} taken</h2>
  <div class="card">${ds.map(d => `<button class="check" data-a="dd" data-k="${d.key}"><span class="tx"><b>${C.fmtT(d.t)}</b> · ${esc(d.m.name)} ×${d.m.perDose}${d.at ? `<small>${delay(d)}</small>` : ''}</span>${s(d)}</button>`).join('') || '<p class="mini">No scheduled doses today.</p>'}</div>
  <h2>Last 7 days</h2><div class="card"><div class="bars">${wk.map(w => { const pc = w.total ? w.done / w.total : 0; return `<div><b class="${!w.total ? 'none' : pc === 1 ? 'full' : ''}" style="height:${w.total ? Math.max(4, pc * 100) : 4}%"></b>${C.WD[C.wday(w.d)]}</div>`; }).join('')}</div>
   <div class="row mini"><span>🔥 ${pl(st.streak, 'day')} streak (best ${C.bestStreak(D, n.ymd)})</span><span>⭐ ${st.pts} · Lv ${st.lvl} ${st.title}</span></div>
   <div class="row mini"><span>Taken this week</span><span>${pct(wk)}</span></div></div>
  <h2>Money</h2><button class="card" style="width:100%;text-align:left;font:inherit;color:inherit" data-a="tab" data-k="money">
   ${p.nowTotal ? `<div class="row"><span>Buy before payday</span><b style="color:var(--bad)">${U.money(D, p.nowTotal)}</b></div>` : ''}
   <div class="row"><span>Set aside on ${C.fmtD(p.p1)}</span><b>${U.money(D, p.payTotal)}</b></div><div class="row mini"><span>Spent since ${C.fmtD(p.since)}</span><span>${U.money(D, p.spent)}</span></div></button>`;
}
const pct = wk => { const t = wk.reduce((x, w) => x + w.total, 0), d = wk.reduce((x, w) => x + w.done, 0); return t ? Math.round(d / t * 100) + '% (' + d + ' of ' + t + ')' : '—'; };
function delay(d) { const dt = new Date(d.at), m = dt.getHours() * 60 + dt.getMinutes() - C.mins(d.t); return Math.abs(m) < 5 ? 'On time' : m > 0 ? `${m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ' min'} late` : `${-m} min early`; }
function viewMeds() {
  const D = A.doc, ms = C.medList(D);
  return `<h1>Medicines</h1><p class="sub">Changes reach his devices the next time they sync.</p>
  ${ms.map(m => `<div class="card"><div class="row"><b>💊 ${esc(m.name)}</b><button class="btn ghost" style="padding:6px 12px" data-a="edit" data-id="${m.id}">Edit</button></div>${U.medDetails(D, m, true)}${m.prn ? '' : `<button class="btn ghost full" data-a="buy" data-id="${m.id}">Log a purchase</button>`}</div>`).join('') || '<div class="empty">No medicines yet.</div>'}
  <button class="btn full" data-a="new">+ Add medicine</button>`;
}
function viewHealth() {
  const D = A.doc, all = C.live(D.sick).sort((a, b) => b.t - a.t), open = all.filter(s => s.open === true), past = all.filter(s => s.open !== true);
  const month = past.concat(open).filter(s => now() - s.t < 30 * 864e5).reduce((o, s) => (o[s.name || s.sym] = (o[s.name || s.sym] || 0) + 1, o), {});
  return `<h1>Health</h1><div class="seg"><button class="${healthSeg === 'log' ? 'on' : ''}" data-a="health" data-k="log">📖 Sick logbook</button><button class="${healthSeg === 'profile' ? 'on' : ''}" data-a="health" data-k="profile">👤 Profile</button></div>
  ${healthSeg === 'profile' ? U.profileHtml(D, true) : `
   ${open.length ? `<h2>Happening now</h2>${open.map(s => U.sickCard(D, s)).join('')}` : '<div class="alert ok"><i>💪</i><span>Nothing ongoing right now.</span></div>'}
   <h2>History</h2>${past.slice(0, 40).map(s => U.sickCard(D, s)).join('') || '<p class="mini">No entries yet.</p>'}
   ${Object.keys(month).length ? `<div class="card"><b>Last 30 days</b><p class="mini" style="margin:6px 0 0">${Object.entries(month).map(([k, v]) => `${esc(k)} ×${v}`).join(' · ')}</p></div>` : ''}`}`;
}
function viewSettings() {
  const D = A.doc, c = D.cfg, m = A.meta || {}, num = (k, l, min, max) => `<label>${l}</label><input type="number" min="${min}" max="${max}" data-s="${k}" value="${c[k]}">`;
  const opt = (k, vals, labels) => `<div class="opt">${vals.map((v, i) => `<button class="${c[k] === v ? 'on' : ''}" data-a="copt" data-k="${k}" data-v='${JSON.stringify(v)}'>${labels[i]}</button>`).join('')}</div>`;
  const devs = (m.devices || []).filter(d => d.role === 'phone').sort((a, b) => b.seen - a.seen);
  return `<h1>Settings</h1>
  <div class="card" style="border-color:var(--acc)"><b>🔑 His sign-in</b><p class="mini" style="margin:6px 0 0">${m.user ? `Username: <b>@${esc(m.user)}</b>. Change it or set a new PIN below.` : 'Create his username and a 6-digit PIN. He signs in with these on all his devices.'}</p>
   <label>His username</label><input type="text" id="hl_user" value="${esc(m.user || '')}" autocapitalize="none" spellcheck="false" placeholder="e.g. bob">
   <label>${m.user ? 'New PIN (leave empty to keep his PIN)' : '6-digit PIN'}</label><input type="text" id="hl_pin" class="pinput" inputmode="numeric" maxlength="6" placeholder="••••••">
   <button class="btn full" style="margin-top:10px" data-a="setlogin">${m.user ? 'Save' : 'Create his sign-in'}</button>
   ${m.user ? '<button class="btn ghost full" style="margin-top:8px" data-a="sendlogin">💌 Send him his sign-in</button>' : ''}
   ${devs.length ? `<div class="gh">His devices</div>${devs.map(d => `<div class="row mini"><span>📱 ${esc(d.name || 'Device')}${d.push ? ' · 🔔' : ' · 🔕'}</span><span>${d.seen ? U.ago(d.seen) : ''}</span></div>`).join('')}
     <button class="btn ghost full" style="margin-top:10px" data-a="logoutall">Sign him out of all devices</button>` : ''}</div>
  <div class="card"><label style="margin-top:0">His name</label><input type="text" data-s="name" value="${esc(c.name)}"><label>Your name (shown on his app)</label><input type="text" data-s="helper" value="${esc(c.helper)}" placeholder="e.g. Mary">
   <label>💌 Welcome message for him</label><textarea data-s="gift" rows="3" placeholder="Shown on the first screen of his welcome guide">${esc(c.gift || '')}</textarea></div>
  <div class="card"><b>🔔 My alerts (this device)</b><p class="mini">Missed doses, low stock, sick logs and updates, profile changes and things he adds to his buy list.</p>
   ${pushOn && m.subs && m.subs.admin ? '<span class="pill ok">Alerts are on</span>' : '<button class="btn full" data-a="perm">Turn on alerts for me</button>'}
   <label>Tell me when a dose is not logged after</label>${opt('miss', [0, 30, 60, 120], ['Never', '30 min', '1 hour', '2 hours'])}</div>
  <details class="sec card"><summary><b>⏰ His reminders</b></summary><div><div class="row"><span>Nudge again at +10 and +25 min</span><div class="opt"><button class="${c.nags ? 'on' : ''}" data-a="ctog" data-k="nags">${c.nags ? 'On' : 'Off'}</button></div></div>
   <label>Low-stock warning when pills last</label>${opt('lowDays', [3, 4, 5, 7], ['3 days', '4 days', '5 days', '7 days'])}
   <div class="two"><div>${num('alertHour', 'Daily buy/payday alert (hour, 0-23)', 0, 23)}</div><div>${num('shopHour', 'Buy list reminder (hour)', 0, 23)}</div></div></div></details>
  <details class="sec card"><summary><b>💰 Money</b></summary><div><label style="margin-top:0">Paydays</label><div class="two"><input type="number" min="1" max="31" data-s="pd1" value="${c.paydays[0]}"><input type="number" min="1" max="31" data-s="pd2" value="${c.paydays[1]}"></div>
   <label>Currency symbol</label><input type="text" maxlength="3" data-s="cur" value="${esc(c.cur)}"></div></details>
  <details class="sec card"><summary><b>⭐ Stars and streak</b></summary><div><p class="mini" style="margin-top:0">${(() => { const st = C.stats(D, today().ymd); return `Now: ⭐ ${st.pts} · Lv ${st.lvl} · 🔥 ${st.streak}`; })()}</p><button class="btn ghost full" data-a="reset">Reset his stars and streak to 0</button></div></details>
  <details class="sec card"><summary><b>🔐 My account</b></summary><div>
   ${(m.adminNames || []).length ? `<p class="mini" style="margin-top:0">Signed in as <b>@${esc(m.adminNames.join(', @'))}</b></p><label>Current password</label><input type="password" id="ap_old"><label>New password (8+ characters)</label><input type="password" id="ap_new"><button class="btn ghost full" style="margin-top:8px" data-a="adpass">Change password</button>`
    : `<p class="mini" style="margin-top:0">Create a username and password so you can sign in from any device.</p><label>Username</label><input type="text" id="as_user" autocapitalize="none"><label>Password (8+ characters)</label><input type="password" id="as_pass"><button class="btn full" style="margin-top:8px" data-a="adset">Create my login</button>`}
   <button class="btn red full" style="margin-top:12px" data-a="logout">Sign out of back office</button></div></details>
  <p class="mini" style="text-align:center;margin-top:14px">${A.synced ? 'Synced ' + U.ago(A.synced) : ''}</p>`;
}
function doseSheet(key) {
  const D = A.doc, [d, id, t] = key.split('|'), m = D.meds[id]; if (!m) return;
  const at = C.takenAt(D, key);
  U.openSheet(`<h1 style="margin-top:0">${esc(m.name)}</h1><p class="sub">${C.fmtD(d)} at ${C.fmtT(t)} · ${at ? '✅ Taken ' + U.tm(at) : 'Not logged'}</p>
  ${at ? `<button class="btn ghost full" data-a="unmark" data-k="${key}">Mark as not taken</button>` : `<button class="btn full" data-a="mark" data-k="${key}">He took it (mark for him)</button>`}
  <div class="card" style="margin-top:14px">${U.medDetails(D, m, true)}</div>`);
}
function sendLoginSheet(pin) {
  const D = A.doc, user = (A.meta || {}).user;
  const msg = `Hi ${D.cfg.name || 'love'}! 💖 I made you an app to help with your meds.\n\n1. Open this link: ${appLink()}\n2. On iPhone, use Safari and follow the steps to add it to your Home Screen.\n3. Sign in with\n   Username: ${user}\n   PIN: ${pin || '(the PIN I gave you)'}\n\nYou can change your PIN in the app.`;
  A.loginMsg = msg;
  U.openSheet(`<h1 style="margin-top:0">💌 Send him his sign-in</h1><p class="sub">Send this privately. ${pin ? '' : 'Set a new PIN first if you want it included.'}</p>
   <div class="gift">${esc(msg)}</div>
   ${navigator.share ? '<button class="btn full big" data-a="sharelogin">Share…</button>' : ''}<button class="btn ${navigator.share ? 'ghost' : ''} full" style="margin-top:8px" data-a="copylogin">Copy message</button>`);
}
function render() {
  document.body.classList.add('wide');
  if (!A) { $('#app').innerHTML = viewLogin(); $('#nav').innerHTML = ''; return; }
  $('#app').innerHTML = tab === 'home' ? viewHome() : tab === 'meds' ? viewMeds() : tab === 'money' ? U.moneyHtml(A.doc, true) : tab === 'health' ? viewHealth() : tab === 'buy' ? U.buyHtml(A.doc, true) : viewSettings();
  $('#nav').innerHTML = [['home', '📋', 'Overview'], ['meds', '💊', 'Meds'], ['health', '🩺', 'Health'], ['buy', '🛒', 'Buy'], ['money', '💰', 'Money'], ['set', '⚙️', 'Settings']].map(([k, i, l]) => `<button data-a="tab" data-k="${k}" class="${tab === k ? 'on' : ''}"><i>${i}</i>${l}</button>`).join('');
}

/* ---------- events ---------- */
const errText = e => ({ taken: 'That username is already taken.', username: 'Usernames are 3 to 24 lowercase letters, numbers, dots or dashes.', password: 'Passwords need at least 8 characters.', pin: 'The PIN must be exactly 6 numbers.', full: 'Your worker has too many profiles.', wrong: 'Wrong username or password.', locked: `Too many tries. Wait ${e.minutes || 15} minutes.` }[e.message] || 'Check your internet and try again.');
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a; if (b.tagName === 'A') ev.preventDefault();
  if (a === 'lmode') { loginMode = b.dataset.k; render(); return; }
  if (a === 'adlogin' || a === 'signup') {
    const user = ($('#ad_user').value || '').trim().toLowerCase(), pass = $('#ad_pass').value;
    if (a === 'signup' && pass !== $('#ad_pass2').value) return say("Passwords don't match", 'Type the same password twice.', '🔐');
    b.disabled = true;
    try { signedIn(await api(a === 'signup' ? '/auth/admin-signup' : '/auth/admin-login', { user, pass })); toast(a === 'signup' ? "Let's set it up 🎁" : 'Welcome back 💖'); if (a === 'signup') { tab = 'set'; render(); } }
    catch (e) { say(a === 'signup' ? 'Could not create it' : 'Could not sign in', errText(e), '🔐'); }
    b.disabled = false; return;
  }
  if (!A) return;
  if (U.uiClick(a, b)) return;
  if (await U.v6Click(a, b)) return;
  const D = A.doc, t = now();
  if (a === 'tab') { tab = b.dataset.k; render(); window.scrollTo(0, 0); }
  else if (a === 'health') { tab = 'health'; healthSeg = b.dataset.k; render(); }
  else if (a === 'refresh') sync();
  else if (a === 'dd') doseSheet(b.dataset.k);
  else if (a === 'mark' || a === 'unmark') { const k = b.dataset.k, m = D.meds[k.split('|')[1]]; if (a === 'mark' && !(await ask({ icon: '✅', title: 'Mark as taken?', text: 'His devices will stop reminding him about this dose.', ok: 'Mark taken' }))) return; D.log[k] = { t: a === 'mark' ? t : 0, p: m ? m.perDose : 1, u: t, by: 'helper' }; U.closeSheet(); save(); }
  else if (a === 'new') U.openEditor(CX);
  else if (a === 'edit') U.openEditor(CX, b.dataset.id);
  else if (a === 'buy') U.openBuy(CX, b.dataset.id);
  else if (a === 'det') { tab = 'meds'; render(); }
  else if (a === 'delbuy') { const x = D.buys[b.dataset.id]; if (x && await ask({ icon: '🗑️', title: 'Remove this purchase?', ok: 'Remove', danger: true })) { D.buys[x.id] = { ...x, del: true, u: t }; save(); } }
  else if (a === 'ctog') { D.cfg = { ...D.cfg, [b.dataset.k]: !D.cfg[b.dataset.k], u: t }; save(); }
  else if (a === 'copt') { D.cfg = { ...D.cfg, [b.dataset.k]: JSON.parse(b.dataset.v), u: t }; save(); }
  else if (a === 'perm') enablePush();
  else if (a === 'reset') { if (await ask({ icon: '🔄', title: 'Reset stars and streak?', text: 'His stars, level and streak go back to 0. Medicines and dose history stay.', ok: 'Reset', danger: true })) { D.cfg = { ...D.cfg, ptsBase: 0, resetAt: t, resetDay: today().ymd, u: t }; save(); toast('Reset to 0 ✓'); } }
  else if (a === 'setlogin') {
    const user = ($('#hl_user').value || '').trim().toLowerCase(), pin = ($('#hl_pin').value || '').trim();
    if (pin && !/^\d{6}$/.test(pin)) return say('6 digits please', 'The PIN must be exactly 6 numbers.', '🔑');
    if (!A.meta.user && !pin) return say('Add a PIN', 'Type a 6-digit PIN for him.', '🔑');
    try { const j = await api('/auth/set-login', { ...me(), user, pin: pin || undefined }); A.meta = j.meta; persist(); render(); toast('Saved 🔑'); sendLoginSheet(pin); }
    catch (e) { say('Could not save', errText(e), '🔑'); }
  }
  else if (a === 'sendlogin') sendLoginSheet('');
  else if (a === 'copylogin') { try { await navigator.clipboard.writeText(A.loginMsg); toast('Copied. Send it to him privately 💌'); } catch (e) { say('Copy it from the box', '', '📋'); } }
  else if (a === 'sharelogin') { try { await navigator.share({ text: A.loginMsg }); } catch (e) {} }
  else if (a === 'logoutall') { if (await ask({ icon: '📵', title: 'Sign him out everywhere?', text: 'Use this if he lost a device. He signs in again with his username and PIN.', ok: 'Sign out all', danger: true })) { try { const j = await api('/auth/logout-all', me()); A.meta = j.meta; persist(); render(); toast('Signed out of all his devices'); } catch (e) { say('No connection', '', '📶'); } } }
  else if (a === 'adset') { try { const j = await api('/auth/admin-set', { ...me(), user: ($('#as_user').value || '').trim().toLowerCase(), pass: $('#as_pass').value }); A.meta = j.meta; persist(); render(); toast('Login created 🔐'); } catch (e) { say('Could not create it', errText(e), '🔐'); } }
  else if (a === 'adpass') { try { await api('/auth/admin-pass', { ...me(), user: A.meta.adminNames[0], old: $('#ap_old').value, pass: $('#ap_new').value }); toast('Password changed 🔐'); render(); } catch (e) { say('Could not change it', e.status === 403 ? 'Your current password is wrong.' : errText(e), '🔐'); } }
  else if (a === 'logout') { if (await ask({ icon: '👋', title: 'Sign out?', text: 'You can sign in again with your username and password.', ok: 'Sign out', danger: true })) { try { await api('/auth/logout', me()); } catch (e) {} A = null; localStorage.removeItem(AK); render(); } }
});
document.addEventListener('change', ev => {
  if (A && U.uiChange(ev)) return;
  const k = ev.target.dataset && ev.target.dataset.s; if (!k || !A) return;
  const D = A.doc, v = ev.target.value, t = now(), c = { ...D.cfg };
  if (k === 'name' || k === 'helper' || k === 'gift') c[k] = v.trim();
  else if (k === 'cur') c.cur = v.trim() || '₱';
  else if (k === 'pd1' || k === 'pd2') { const pd = [...c.paydays]; pd[k === 'pd1' ? 0 : 1] = Math.min(31, Math.max(1, parseInt(v) || 15)); c.paydays = pd; }
  else if (k === 'alertHour' || k === 'shopHour') c[k] = Math.min(23, Math.max(0, parseInt(v) || 0));
  c.u = t; D.cfg = c; save();
});
document.addEventListener('input', U.uiInput);
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !A && e.target.tagName === 'INPUT') { const b = $('[data-a="adlogin"],[data-a="signup"]'); if (b) b.click(); } });
setInterval(() => { if (!document.hidden && A) sync(); }, 60000);
setInterval(() => { if (A && !U.sheetOpen() && !typing()) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && A) sync(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render(); if (A) { sync(); checkPush(); }
