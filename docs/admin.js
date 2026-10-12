// BlovMed back office: the helper's page, synced with his phone.
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
const CX = { doc, save };
const now = () => Date.now();
let tab = 'home', pushOn = false;

/* ---------- sync ---------- */
let syncT, syncing = false, again = false;
const queueSync = (d = 600) => { clearTimeout(syncT); syncT = setTimeout(sync, d); };
async function api(path, body) {
  const r = await fetch(WORKER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'failed'); e.status = r.status; throw e; } return j;
}
async function sync() {
  if (!A || !WORKER) return;
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const body = { pid: A.pid, key: A.key, role: 'admin', doc: A.doc }; if (A.sendSub !== undefined) body.sub = A.sendSub;
    const j = await api('/p/sync', body);
    delete A.sendSub; A.doc = C.merge(A.doc, j.doc); A.meta = j.meta; A.synced = now(); persist();
    if (!U.sheetOpen() && !typing()) render();
  } catch (e) {
    if (e.status === 401) { A = null; localStorage.removeItem(AK); render(); say('This back office was unlinked from his phone. Ask him for a new code.', '', '💬'); }
  } finally { syncing = false; if (again) { again = false; queueSync(200); } }
}
const typing = () => document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);

/* ---------- my own alerts (missed doses, low stock, sick reports) ---------- */
const b64 = x => { x = x.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(x + '='.repeat((4 - x.length % 4) % 4)), c => c.charCodeAt(0)); };
async function checkPush() {
  try { if (!('serviceWorker' in navigator) || !('PushManager' in window)) return; const reg = await navigator.serviceWorker.ready, s = await reg.pushManager.getSubscription(); pushOn = !!s && Notification.permission === 'granted';
    if (pushOn && A && A.meta && !A.meta.subs.admin) { A.sendSub = s.toJSON(); queueSync(0); } } catch (e) {}
}
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return say('This browser cannot show alerts. On iPhone, add this page to your Home Screen first.', '', '💬');
  try {
    if (await Notification.requestPermission() !== 'granted') return say('Alerts were not allowed. Turn on notifications for this site in your phone settings.', '', '💬');
    const reg = await navigator.serviceWorker.ready;
    const s = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CFG.vapid) });
    A.sendSub = s.toJSON(); pushOn = true; await sync(); render(); toast('Alerts are on for this device 🔔');
  } catch (e) { say('Could not turn on alerts', esc(e.message), '😕'); }
}

/* ---------- views ---------- */
function viewLogin() {
  return `<h1>BlovMed back office 💖</h1><p class="sub">Help manage his medicines from your own phone.</p>
  <div class="card" style="border-color:var(--acc)"><b>🎁 Giving BlovMed as a gift?</b><p class="mini" style="margin:6px 0 10px">Start here. Set up his medicines, prices and a welcome message first, then send him one link. Everything will be ready when he opens it.</p>
  <button class="btn full big" data-a="create">Start setting up</button></div>
  <div class="card"><b>Already on his phone?</b><p class="mini" style="margin:6px 0 10px">On his phone: BlovMed → Settings → Helper → Show link code. Type the code here.</p>
  <input type="text" id="code" placeholder="ABCD-EFGH" autocapitalize="characters" autocomplete="off"><button class="btn ghost full" style="margin-top:10px" data-a="login">Link</button></div>
  ${WORKER ? '' : '<div class="alert bad"><i>⚠️</i><span>config.js is not filled in yet.</span></div>'}`;
}
function giftCard() {
  if (!A.meta || A.meta.phone) return '';
  const D = A.doc, ms = C.medList(D), ok = x => x ? '✅' : '⬜';
  return `<div class="card" style="border-color:var(--acc)"><b>🎁 Getting his gift ready</b>
   <div class="howrow"><i>${ok(D.cfg.name && D.cfg.helper)}</i><span>His name and your name<small>Settings tab</small></span></div>
   <div class="howrow"><i>${ok(D.cfg.gift)}</i><span>A welcome message <small>Shown first when he opens it (Settings tab)</small></span></div>
   <div class="howrow"><i>${ok(ms.length)}</i><span>His medicines, times and prices<small>${ms.length ? pl(ms.length, 'medicine') + ' added' : 'Meds tab'}</small></span></div>
   <button class="btn full" style="margin-top:10px" data-a="giftlink">💌 Create his gift link</button></div>`;
}
function alertsHtml(D, n) {
  const out = [], who = D.cfg.name || 'He';
  const ds = [...C.dosesOn(D, C.addD(n.ymd, -1)).filter(d => d.t >= '18:00'), ...C.dosesOn(D, n.ymd)];
  for (const d of ds) { if (d.at) continue; const late = (d.d < n.ymd ? n.min + 1440 : n.min) - C.mins(d.t); if (late >= 30 && late < 18 * 60) out.push(['bad', '⏰', `${esc(d.m.name)} not logged`, `Due ${d.d < n.ymd ? 'last night ' : ''}at ${C.fmtT(d.t)} (${late >= 120 ? Math.floor(late / 60) + ' h' : late + ' min'} ago)`, `data-a="dd" data-k="${d.key}"`]); }
  const p = C.plan(D, n.ymd);
  for (const r of p.rows) if (r.dl.days <= D.cfg.lowDays) out.push(['', '🛒', `${esc(r.m.name)}: ${r.dl.days === 0 ? 'out today' : pl(r.dl.days, 'day') + ' left'}`, esc(C.buyAdvice(r, p, x => U.money(D, x))), `data-a="buy" data-id="${r.m.id}"`]);
  if (p.noPrice.length) out.push(['', '✏️', 'Missing prices', `Add a price per pill for ${esc(p.noPrice.join(', '))}`, `data-a="tab" data-k="meds"`]);
  for (const s of C.live(D.sick).filter(s => now() - s.t < 3 * 864e5).sort((a, b) => b.t - a.t)) out.push(['bad', U.SYM[s.sym] ? U.SYM[s.sym].e : '🤒', `${esc(who)} reported: ${esc(s.name || s.sym)}`, U.fmtDT(s.t) + ' · ' + U.ago(s.t), `data-a="tab" data-k="health"`]);
  const open = C.live(D.shop).filter(s => !s.done);
  if (open.length) out.push(['', '🧺', `${pl(open.length, 'item')} on his shopping list`, open.map(s => esc(s.text)).join(', '), `data-a="tab" data-k="health"`]);
  if (A.meta && A.meta.phone && !A.meta.subs.phone) out.push(['bad', '🔕', 'Reminders are off on his phone', 'Ask him to open BlovMed and tap "Turn on phone reminders".', '']);
  if (A.meta && A.meta.seen && A.meta.seen.phone && now() - A.meta.seen.phone > 2 * 864e5) out.push(['', '📵', 'His app hasn\'t synced in a while', 'Last seen ' + U.ago(A.meta.seen.phone) + '. Reminders still work if his phone is online.', '']);
  return out.length ? out.map(([c, i, t, s, at]) => `<button class="alert ${c}" ${at}><i>${i}</i><span>${t}<small>${s}</small></span></button>`).join('') : '<div class="alert ok"><i>✅</i><span>All good right now.</span></div>';
}
function viewHome() {
  const D = A.doc, n = today(), ds = C.dosesOn(D, n.ymd), st = C.stats(D, n.ymd), wk = C.week(D, n.ymd), p = C.plan(D, n.ymd), who = D.cfg.name || 'Him';
  const seen = A.meta && A.meta.seen && A.meta.seen.phone;
  const s = d => d.at ? `<span class="pill ok">✓ ${U.tm(d.at)}</span>` : (n.min - C.mins(d.t) >= 30 ? '<span class="pill bad">Not logged</span>' : n.min >= C.mins(d.t) ? '<span class="pill warn">Due now</span>' : '<span class="pill">Later</span>');
  return `<h1>${esc(who)}'s meds</h1><p class="sub">${seen ? 'His phone synced ' + U.ago(seen) : A.meta && !A.meta.phone ? 'Not on his phone yet' : 'Waiting for his phone to sync'} · <a href="#" data-a="refresh" style="color:var(--acc)">refresh</a></p>
  ${giftCard()}<h2>Needs attention</h2>${alertsHtml(D, n)}
  <h2>Today · ${ds.filter(d => d.at).length} of ${ds.length} taken</h2>
  <div class="card">${ds.map(d => `<button class="check" data-a="dd" data-k="${d.key}"><span class="tx"><b>${C.fmtT(d.t)}</b> · ${esc(d.m.name)} ×${d.m.perDose}${d.at && C.mins(d.t) ? `<small>${delay(d)}</small>` : ''}</span>${s(d)}</button>`).join('') || '<p class="mini">No scheduled doses today.</p>'}</div>
  <h2>Last 7 days</h2><div class="card"><div class="bars">${wk.map(w => { const pct = w.total ? w.done / w.total : 0; return `<div><b class="${!w.total ? 'none' : pct === 1 ? 'full' : ''}" style="height:${w.total ? Math.max(4, pct * 100) : 4}%"></b>${C.WD[C.wday(w.d)]}</div>`; }).join('')}</div>
   <div class="row mini"><span>🔥 ${pl(st.streak, 'day')} streak</span><span>⭐ ${st.pts} · Lv ${st.lvl} ${st.title}</span></div>
   <div class="row mini"><span>Taken this week</span><span>${pct(wk)}</span></div></div>
  <h2>Money</h2><button class="card" style="width:100%;text-align:left;font:inherit;color:inherit" data-a="tab" data-k="money">
   ${p.nowTotal ? `<div class="row"><span>Buy before payday</span><b style="color:var(--bad)">${U.money(D, p.nowTotal)}</b></div>` : ''}
   <div class="row"><span>Set aside on ${C.fmtD(p.p1)}</span><b>${U.money(D, p.payTotal)}</b></div><div class="row mini"><span>Spent since ${C.fmtD(p.since)}</span><span>${U.money(D, p.spent)}</span></div></button>`;
}
const pct = wk => { const t = wk.reduce((x, w) => x + w.total, 0), d = wk.reduce((x, w) => x + w.done, 0); return t ? Math.round(d / t * 100) + '% (' + d + ' of ' + t + ')' : '—'; };
function delay(d) { const dt = new Date(d.at), m = dt.getHours() * 60 + dt.getMinutes() - C.mins(d.t); return Math.abs(m) < 5 ? 'On time' : m > 0 ? `${m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ' min'} late` : `${-m} min early`; }
function viewMeds() {
  const D = A.doc, ms = C.medList(D);
  return `<h1>Medicines</h1><p class="sub">Changes show up on his phone the next time it syncs (when he opens the app).</p>
  ${ms.map(m => `<div class="card"><div class="row"><b>💊 ${esc(m.name)}</b><button class="btn ghost" style="padding:6px 12px" data-a="edit" data-id="${m.id}">Edit</button></div>${U.medDetails(D, m, true)}${m.prn ? '' : `<button class="btn ghost full" data-a="buy" data-id="${m.id}">Log a purchase</button>`}</div>`).join('') || '<div class="empty">No medicines yet.</div>'}
  <button class="btn full" data-a="new">+ Add medicine</button>`;
}
function viewHealth() {
  const D = A.doc, sick = C.live(D.sick).sort((a, b) => b.t - a.t), shop = C.live(D.shop).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.add - a.add);
  return `<h1>Health</h1>
  <h2>🛒 His shopping list</h2><div class="card">${shop.map(s => `<div class="row"><button class="check ${s.done ? 'on' : ''}" data-a="shop" data-id="${s.id}"><span class="box">✓</span><span class="tx">${esc(s.text)}<small>${s.why ? 'For ' + esc(s.why) + ' · ' : ''}added ${U.ago(s.add)}${s.done ? ' · bought' : ''}</small></span></button><button class="btn ghost" style="padding:4px 10px" data-a="delshop" data-id="${s.id}" aria-label="Remove">✕</button></div>`).join('') || '<p class="mini">Empty.</p>'}
   <div class="add" style="margin-top:10px"><input type="text" id="newitem" placeholder="Add an item, e.g. Bananas"><button class="btn" data-a="additem">Add</button></div>
   <p class="mini" style="margin:6px 0 0">He gets a reminder 1 hour after items are added, and at ${C.fmtT(C.pad(D.cfg.shopHour) + ':00')} each day for 3 days until they're ticked off.</p></div>
  <h2>🤒 Sick reports</h2><div class="card">${sick.slice(0, 40).map(s => `<div class="row"><span>${U.SYM[s.sym] ? U.SYM[s.sym].e : '🤒'} ${esc(s.name || s.sym)}</span><span class="mini">${U.fmtDT(s.t)}</span></div>`).join('') || '<p class="mini">None reported.</p>'}
   ${sick.length ? `<p class="mini" style="margin:10px 0 0">Last 30 days: ${Object.entries(sick.filter(s => now() - s.t < 30 * 864e5).reduce((o, s) => (o[s.name || s.sym] = (o[s.name || s.sym] || 0) + 1, o), {})).map(([k, v]) => `${esc(k)} ×${v}`).join(', ') || 'none'}</p>` : ''}</div>`;
}
function viewSettings() {
  const D = A.doc, c = D.cfg, num = (k, l, min, max, extra = '') => `<label>${l}</label><input type="number" min="${min}" max="${max}" data-s="${k}" value="${c[k]}" ${extra}>`;
  const opt = (k, vals, labels) => `<div class="opt">${vals.map((v, i) => `<button class="${c[k] === v ? 'on' : ''}" data-a="copt" data-k="${k}" data-v='${JSON.stringify(v)}'>${labels[i]}</button>`).join('')}</div>`;
  return `<h1>Settings</h1>
  <div class="card"><label style="margin-top:0">His name</label><input type="text" data-s="name" value="${esc(c.name)}"><label>Your name (shown on his phone)</label><input type="text" data-s="helper" value="${esc(c.helper)}" placeholder="e.g. Mary">
   <label>💌 Welcome message for him</label><textarea data-s="gift" rows="3" placeholder="Shown on the first screen of his welcome guide">${esc(c.gift || '')}</textarea></div>
  <div class="card"><b>🔔 My alerts (this device)</b><p class="mini">Get told when he misses a dose, runs low, or reports feeling sick.</p>
   ${pushOn && A.meta && A.meta.subs.admin ? '<span class="pill ok">Alerts are on</span>' : '<button class="btn full" data-a="perm">Turn on alerts for me</button>'}
   <label>Tell me when a dose is not logged after</label>${opt('miss', [0, 30, 60, 120], ['Never', '30 min', '1 hour', '2 hours'])}</div>
  <div class="card"><b>⏰ His reminders</b><div class="row" style="margin-top:8px"><span>Nudge again at +10 and +25 min</span><div class="opt"><button class="${c.nags ? 'on' : ''}" data-a="ctog" data-k="nags">${c.nags ? 'On' : 'Off'}</button></div></div>
   <label>Low-stock warning when pills last</label>${opt('lowDays', [3, 4, 5, 7], ['3 days', '4 days', '5 days', '7 days'])}
   <div class="two"><div>${num('alertHour', 'Daily buy/payday alert (hour, 0-23)', 0, 23)}</div><div>${num('shopHour', 'Shopping list reminder (hour)', 0, 23)}</div></div></div>
  <div class="card"><b>💰 Money</b><label>Paydays</label><div class="two"><input type="number" min="1" max="31" data-s="pd1" value="${c.paydays[0]}"><input type="number" min="1" max="31" data-s="pd2" value="${c.paydays[1]}"></div><label>Currency symbol</label><input type="text" maxlength="3" data-s="cur" value="${esc(c.cur)}"></div>
  <div class="card"><b>📱 His phone</b><p class="mini">Reminders on his phone: <b>${A.meta && A.meta.subs.phone ? 'ON' : 'OFF'}</b>${A.meta && A.meta.tz ? ' · time zone ' + esc(A.meta.tz) : ''}</p>
   <p class="mini">New phone, or he deleted the app? Get a code, then on the new phone: Settings → Helper → Moving from another phone.</p><button class="btn ghost full" data-a="code">Link a new phone</button></div>
  <div class="card"><b>⭐ Stars and streak</b><p class="mini">${(() => { const st = C.stats(D, today().ymd); return `Now: ⭐ ${st.pts} · Lv ${st.lvl} · 🔥 ${st.streak}`; })()}</p><button class="btn ghost full" data-a="reset">Reset his stars and streak to 0</button></div>
  <button class="btn red full" data-a="logout">Log out of back office</button>
  <p class="mini" style="text-align:center;margin-top:14px">${A.synced ? 'Synced ' + U.ago(A.synced) : ''}</p>`;
}
function doseSheet(key) {
  const D = A.doc, [d, id, t] = key.split('|'), m = D.meds[id]; if (!m) return;
  const at = C.takenAt(D, key);
  U.openSheet(`<h1 style="margin-top:0">${esc(m.name)}</h1><p class="sub">${C.fmtD(d)} at ${C.fmtT(t)} · ${at ? '✅ Taken ' + U.tm(at) : 'Not logged'}</p>
  ${at ? `<button class="btn ghost full" data-a="unmark" data-k="${key}">Mark as not taken</button>` : `<button class="btn full" data-a="mark" data-k="${key}">He took it (mark for him)</button>`}
  <div class="card" style="margin-top:14px">${U.medDetails(D, m, true)}</div><button class="btn ghost full" data-a="close">Close</button>`);
}
function render() {
  document.body.classList.add('wide');
  if (!A) { $('#app').innerHTML = viewLogin(); $('#nav').innerHTML = ''; return; }
  $('#app').innerHTML = tab === 'home' ? viewHome() : tab === 'meds' ? viewMeds() : tab === 'money' ? U.moneyHtml(A.doc, true) : tab === 'health' ? viewHealth() : viewSettings();
  $('#nav').innerHTML = [['home', '📋', 'Overview'], ['meds', '💊', 'Meds'], ['money', '💰', 'Money'], ['health', '🤒', 'Health'], ['set', '⚙️', 'Settings']].map(([k, i, l]) => `<button data-a="tab" data-k="${k}" class="${tab === k ? 'on' : ''}"><i>${i}</i>${l}</button>`).join('');
}

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a; if (b.tagName === 'A') ev.preventDefault();
  if (A && U.uiClick(a, b)) return;
  if (a === 'login') {
    const code = ($('#code').value || '').trim(); if (!code) return;
    try { const j = await api('/p/claim', { code }); if (j.role !== 'admin') return say('That code is for a phone, not for the back office.', '', '💬');
      A = { pid: j.pid, key: j.key, doc: C.merge(C.newDoc(), j.doc), meta: j.meta, synced: now() }; persist(); render(); toast('Linked 🎉'); checkPush();
    } catch (e) { say('That code did not work. Codes last 15 minutes and work once.', '', '💬'); }
    return;
  }
  if (a === 'create') {
    try { const j = await api('/p/sync', { role: 'admin', doc: C.newDoc() });
      A = { pid: j.pid, key: j.key, doc: C.merge(C.newDoc(), j.doc), meta: j.meta, synced: now() }; persist(); tab = 'set'; render(); toast('Let\'s set it up 🎁'); checkPush();
    } catch (e) { say(e.message === 'full' ? 'Server is full' : 'No connection', e.message === 'full' ? 'Too many profiles on your worker.' : 'Check your internet and try again.', '📶'); }
    return;
  }
  if (!A) return;
  const D = A.doc, t = now();
  if (a === 'tab') { tab = b.dataset.k; render(); window.scrollTo(0, 0); }
  else if (a === 'refresh') sync();
  else if (a === 'dd') doseSheet(b.dataset.k);
  else if (a === 'mark' || a === 'unmark') { const k = b.dataset.k, m = D.meds[k.split('|')[1]]; if (a === 'mark' && !(await ask({ icon: '✅', title: 'Mark as taken?', text: 'His phone will stop reminding him about this dose.', ok: 'Mark taken' }))) return; D.log[k] = { t: a === 'mark' ? t : 0, p: m ? m.perDose : 1, u: t, by: 'helper' }; U.closeSheet(); save(); }
  else if (a === 'new') U.openEditor(CX);
  else if (a === 'edit') U.openEditor(CX, b.dataset.id);
  else if (a === 'buy') U.openBuy(CX, b.dataset.id);
  else if (a === 'det') { tab = 'meds'; render(); }
  else if (a === 'delbuy') { const x = D.buys[b.dataset.id]; if (x && await ask({ icon: '🗑️', title: 'Remove this purchase?', ok: 'Remove', danger: true })) { D.buys[x.id] = { ...x, del: true, u: t }; save(); } }
  else if (a === 'shop') { const s = D.shop[b.dataset.id]; if (s) { D.shop[s.id] = { ...s, done: s.done ? 0 : t, u: t }; save(); } }
  else if (a === 'delshop') { const s = D.shop[b.dataset.id]; if (s) { D.shop[s.id] = { ...s, del: true, u: t }; save(); } }
  else if (a === 'additem') { const v = ($('#newitem').value || '').trim(); if (!v) return; const id = C.rid('s'); D.shop[id] = { id, text: v, kind: 'other', why: '', add: t, done: 0, u: t }; save(); toast('Added. He will be reminded.'); }
  else if (a === 'ctog') { D.cfg = { ...D.cfg, [b.dataset.k]: !D.cfg[b.dataset.k], u: t }; save(); }
  else if (a === 'copt') { D.cfg = { ...D.cfg, [b.dataset.k]: JSON.parse(b.dataset.v), u: t }; save(); }
  else if (a === 'perm') enablePush();
  else if (a === 'giftlink') {
    if (!C.medList(D).length && !(await ask({ icon: '💊', title: 'No medicines yet', text: 'He can add them himself, but it is nicer if they are ready. Create the link anyway?', ok: 'Create link', cancel: 'Add meds first' }))) { tab = 'meds'; render(); return; }
    try {
      await sync(); const j = await api('/p/code', { pid: A.pid, key: A.key, role: 'admin', gift: true });
      const link = location.href.replace(/admin\.html.*$/, '').replace(/[#?].*$/, '') + '#gift=' + j.code;
      const msg = `Hi ${D.cfg.name || 'love'}! 💖 I made you an app to help with your meds. Open this link${'\n'}${link}${'\n'}On iPhone, open it in Safari and follow the steps on screen.`;
      A.giftMsg = msg; persist();
      U.openSheet(`<h1 style="margin-top:0">💌 His gift link</h1><p class="sub">Send him this message. The link works once and lasts ${j.days} days.</p>
       <div class="gift">${esc(msg)}</div>
       ${navigator.share ? '<button class="btn full big" data-a="sharegift">Share…</button>' : ''}<button class="btn ${navigator.share ? 'ghost' : ''} full" style="margin-top:8px" data-a="copygift">Copy message</button>
       <p class="mini" style="margin-top:12px">Code if he needs to type it: <b>${j.code}</b>. Need a new one? Just create another link.</p>`);
    } catch (e) { say('No connection', 'Could not create the link. Check your internet.', '📶'); }
  }
  else if (a === 'copygift') { try { await navigator.clipboard.writeText(A.giftMsg); toast('Copied. Paste it in your chat with him 💌'); } catch (e) { say('Copy it from the box', '', '📋'); } }
  else if (a === 'sharegift') { try { await navigator.share({ text: A.giftMsg }); } catch (e) {} }
  else if (a === 'reset') { if (await ask({ icon: '🔄', title: 'Reset stars and streak?', text: 'His stars, level and streak go back to 0. Medicines and dose history stay.', ok: 'Reset', danger: true })) { D.cfg = { ...D.cfg, ptsBase: 0, resetAt: t, resetDay: today().ymd, u: t }; save(); toast('Reset to 0 ✓'); } }
  else if (a === 'code') { try { const j = await api('/p/code', { pid: A.pid, key: A.key, role: 'admin' }); U.openSheet(`<h1 style="margin-top:0">Code for his new phone</h1><p>On the new phone, open BlovMed → Settings → Helper → <b>Moving from another phone?</b> and type:</p><div class="code">${j.code}</div><p class="mini">Works once, for 15 minutes. The old phone will stop syncing.</p><button class="btn full" data-a="close">Done</button>`); } catch (e) { say('Could not get a code. Check your internet.', '', '💬'); } }
  else if (a === 'logout') { if (await ask({ icon: '👋', title: 'Log out?', text: 'You will need a new code from his phone to come back.', ok: 'Log out', danger: true })) { A = null; localStorage.removeItem(AK); render(); } }
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
setInterval(() => { if (!document.hidden && A) sync(); }, 60000);
setInterval(() => { if (A && !U.sheetOpen() && !typing()) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && A) sync(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render(); if (A) { sync(); checkPush(); }
