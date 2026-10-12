// BlovMed shared screens for the app (index.html) and the back office (admin.html).
import * as C from './core.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (doc, n) => { const r = Math.round((n || 0) * 100) / 100; return (doc.cfg.cur || '₱') + r.toLocaleString('en-US', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
export const today = () => C.localNow(undefined, Date.now());
export const tm = ts => { const d = new Date(ts); return C.fmtT(C.pad(d.getHours()) + ':' + C.pad(d.getMinutes())); };
export const fmtDT = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + tm(ts);
export const ago = t => { const h = (Date.now() - t) / 36e5; return h < 1 / 60 ? 'just now' : h < 1 ? Math.round(h * 60) + ' min ago' : h < 24 ? (Math.round(h * 10) / 10) + ' h ago' : Math.floor(h / 24) + ' days ago'; };
export const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
export function toast(msg) { document.querySelectorAll('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2700); }
/* ---------- clean pop-up questions (instead of the browser's "site says" boxes) ---------- */
export function ask({ title, text = '', ok = 'OK', cancel = 'Cancel', danger = false, icon = '' }) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${icon ? `<div class="micon">${icon}</div>` : ''}<h3>${title}</h3>${text ? `<p>${text}</p>` : ''}<div class="mbtns">${cancel ? `<button class="btn ghost" data-m="0">${cancel}</button>` : ''}<button class="btn ${danger ? 'red' : ''}" data-m="1">${ok}</button></div></div>`;
    m.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-m]'); if (!b && e.target !== m) return; m.remove(); res(!!b && b.dataset.m === '1'); });
    document.body.appendChild(m); m.querySelector('[data-m="1"]').focus();
  });
}
export const say = (title, text, icon = 'ℹ️') => ask({ title, text, ok: 'Got it', cancel: null, icon });

/* ---------- bottom sheets + the phone's back button ---------- */
let ignorePop = 0, backFn = null;
export const onBack = fn => { backFn = fn; };
export function pushView() { history.pushState({ v: 1 }, ''); }
export function openSheet(html, noBack) {
  if (!sheetOpen()) history.pushState({ sheet: 1 }, '');
  $('#sheetBody').innerHTML = (noBack ? '' : '<button class="back" data-a="close">← Back</button>') + html;
  $('#sheet').classList.add('open'); $('#sheetBody').scrollTop = 0;
}
export function closeSheet(fromPop) {
  const was = sheetOpen();
  $('#sheet').classList.remove('open'); E = null; sheetKind = null;
  if (was && !fromPop && history.state && history.state.sheet) { ignorePop++; history.back(); }
}
export const goBack = () => history.back();
document.addEventListener('click', e => { if (e.target && e.target.id === 'sheet') closeSheet(); }); // tap outside a sheet to close it
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  if (document.querySelector('.modal')) { document.querySelector('.modal [data-m="0"],.modal [data-m="1"]').click(); return; }
  if (sheetOpen()) { closeSheet(true); return; }
  if (backFn) backFn();
});
export function sheetOpen() { return $('#sheet').classList.contains('open'); }

/* ---------- common medicines (adult label guides) ---------- */
export const LIB = {
  para: { n: 'Paracetamol 500 mg', dose: 1, mp: 2, max: 8, gap: 4, every: 6, days: 3, per: '1 to 2 tablets (500 to 1,000 mg) every 4 to 6 hours', lim: 'Never more than 8 tablets in 24 hours, with at least 4 hours between doses. Many cold and flu pills already contain paracetamol, so do not double up.', course: { type: 'hours', gap: 5, cnt: 4, first: '08:00' } },
  ibu: { n: 'Ibuprofen 200 mg', dose: 1, mp: 2, max: 6, gap: 4, every: 8, days: 3, per: '1 to 2 tablets (200 to 400 mg), up to 3 times a day, always with food', lim: 'Never more than 6 tablets (1,200 mg) in 24 hours. Not for stomach pain, ulcers, kidney problems, or if dengue is possible.', notes: 'Take with food', course: { type: 'hours', gap: 6, cnt: 3, first: '08:00' } },
  lop: { n: 'Loperamide 2 mg', dose: 1, mp: 2, max: 4, gap: 1, days: 2, per: 'Start with 2 capsules, then 1 after each loose stool', lim: 'Never more than 4 capsules (8 mg) a day without a doctor. See a doctor if it lasts over 2 days. Not for diarrhea with fever or blood.' },
  cet: { n: 'Cetirizine 10 mg', dose: 1, mp: 1, max: 1, gap: 20, every: 24, days: 7, per: '1 tablet once a day', lim: 'Only 1 tablet a day. It can make you sleepy, so many people take it at night.', course: { type: 'daily', times: ['20:00'] } },
  ors: { n: 'Oral rehydration salts (ORS)', dose: 1, mp: null, max: null, gap: 0, days: 2, unit: 'sachet', per: 'Mix exactly as the packet says. Sip small amounts often.', lim: 'Use clean water and the amount on the packet.' },
  anta: { n: 'Antacid tablets', dose: 1, mp: null, max: null, gap: 0, every: 0, days: 2, per: 'Follow your product label, usually after meals and at bedtime.', lim: 'Ask the pharmacist how far apart to take it from your regular medicines.' },
};
// buy: drinks and food to pick up when sick (what to eat and avoid stays as advice).
export const SYM = {
  head: { e: '🤕', n: 'Headache', m: ['para', 'ibu'], drink: ['Bottled water'], food: ['Crackers or a light snack'],
    eat: ['Drink a big glass of water first. Dehydration is a common cause.', 'Eat something light if you skipped a meal.', 'Rest somewhere quiet and dim, and take a break from screens.'],
    avoid: ['Too much coffee or alcohol.', 'Pain pills on more than 2 or 3 days a week. That can make headaches worse.'],
    dr: ['Sudden, severe headache, the worst of your life', 'Headache with stiff neck, high fever, confusion, weakness, or trouble seeing or speaking', 'After a hit to the head', 'Lasting more than 3 days, or coming back often'] },
  fever: { e: '🤒', n: 'Fever', m: ['para'], drink: ['Bottled water', 'Clear soup or broth'], food: ['Lugaw (rice porridge)', 'Bananas'],
    eat: ['Drink lots of fluids: water, ORS, clear soup.', 'Eat light: lugaw (rice porridge), soup, banana.', 'Rest and wear light clothes.'],
    avoid: ['Ibuprofen and aspirin if dengue is possible (it is common in the Philippines). Use paracetamol only until a doctor says otherwise.', 'Alcohol.'],
    dr: ['Fever of 39°C or higher, or lasting more than 2 to 3 days', 'Fever with severe headache, pain behind the eyes, joint pain, rash, or bleeding gums or nose (possible dengue)', 'Trouble breathing, stiff neck, confusion, or you cannot drink fluids'] },
  belly: { e: '😣', n: 'Stomachache', m: ['anta'], drink: ['Ginger tea', 'Bottled water'], food: ['Crackers', 'Bananas', 'Plain rice or lugaw'],
    eat: ['Small plain meals: rice, lugaw, banana, toast or crackers, boiled potato.', 'Sip water or warm water often. Ginger tea can help settle it.', 'Eat slowly and stop when you feel full.'],
    avoid: ['Spicy, oily or fried food, coffee, alcohol and soda.', 'Ibuprofen and other pain pills. They can irritate the stomach.'],
    dr: ['Severe or constant pain, or pain low on the right side', 'Blood in vomit or stool, or black stool', 'Fever, a hard swollen belly, or you cannot keep fluids down', 'Pain lasting more than 2 days'] },
  heart: { e: '🔥', n: 'Heartburn', m: ['anta'], drink: ['Bottled water'], food: ['Crackers', 'Bananas'],
    eat: ['Small meals, eaten slowly.', 'Stay upright for 2 to 3 hours after eating.', 'Water or plain warm water.'],
    avoid: ['Coffee, spicy, fatty or fried food, chocolate, soda, alcohol.', 'Eating right before bed.'],
    dr: ['Chest pain with sweating, shortness of breath, or pain in the arm or jaw: go to the ER now', 'Trouble swallowing, vomiting, or black stool', 'Heartburn on most days for more than 2 weeks'] },
  loose: { e: '🚽', n: 'Diarrhea', m: ['ors', 'lop'], drink: ['Bottled water', 'Clear soup or broth'], food: ['Bananas', 'Plain rice', 'Toast or crackers'],
    eat: ['Sip ORS and water all day, even a little at a time.', 'Plain foods: rice, banana, toast, boiled chicken, clear soup.'],
    avoid: ['Milk, coffee, alcohol, soda, juice, and greasy or spicy food.', 'Loperamide if you have a fever or blood in the stool.'],
    dr: ['Blood or black stool, or a fever', 'Signs of dehydration: very dark urine, dizziness, no urine for 8 hours', 'Lasting more than 2 days, or severe belly pain'] },
  nausea: { e: '🤢', n: 'Nausea or vomiting', m: ['ors'], drink: ['Ginger tea', 'Bottled water'], food: ['Crackers', 'Bananas'],
    eat: ['Wait 30 minutes after vomiting, then take tiny sips of ORS or water.', 'Then crackers, rice or banana. Ginger tea may help.'],
    avoid: ['Greasy, spicy or very sweet food, strong smells, alcohol.'],
    dr: ['You cannot keep any liquid down for 12 to 24 hours', 'Blood in vomit, severe belly pain, or a bad headache with stiff neck', 'Dizziness, very dark urine, or no urine for 8 hours'] },
  cold: { e: '🤧', n: 'Cold or sore throat', m: ['para'], drink: ['Honey (for warm tea)', 'Bottled water'], food: ['Soup (sabaw)', 'Lugaw'],
    eat: ['Warm fluids: soup, warm water, tea with honey.', 'Gargle warm salt water for a sore throat.', 'Rest and drink plenty of water.'],
    avoid: ['Cold pills with decongestants (phenylephrine, pseudoephedrine). They can clash with ADHD medicines. Ask the pharmacist first.', 'Cold products that already contain paracetamol, if you also take paracetamol.'],
    dr: ['Trouble breathing or chest pain', 'Fever over 39°C or lasting more than 3 days', 'Not improving after 7 to 10 days, or a sore throat so bad you cannot swallow'] },
  allergy: { e: '🌼', n: 'Allergy or itching', m: ['cet'], drink: ['Bottled water'], food: [],
    eat: ['Drink water. Wash off the thing that triggered it if you know it.', 'Cool, damp cloth on itchy skin.'],
    avoid: ['Anything you think caused it (food, soap, dust).'],
    dr: ['Swelling of the face, lips or tongue, or trouble breathing: go to the ER now', 'Rash with fever, or a rash spreading fast'] },
  cough: { e: '😷', n: 'Cough', m: [], drink: ['Warm water', 'Honey (for warm tea)'], food: ['Soup (sabaw)'], other: ['Throat lozenges'],
    eat: ['Warm drinks with honey can soothe a cough.', 'Drink plenty of water to loosen mucus.', 'Rest, and stay away from smoke.'],
    avoid: ['Cough and cold syrups with decongestants or many ingredients. Some clash with ADHD medicines, so ask the pharmacist first.', 'Smoking and vaping.'],
    dr: ['Trouble breathing, chest pain, or coughing up blood: go to the ER', 'Cough with a high fever', 'Wheezing, or getting worse instead of better', 'Lasting more than 2 to 3 weeks'] },
  pain: { e: '💪', n: 'Body or muscle pain', m: ['para', 'ibu'], drink: ['Bottled water'], food: [], other: ['Cold pack or warm compress'],
    eat: ['Rest the sore area.', 'Fresh injury: cold pack for the first 1 to 2 days, then warm compress.', 'Gentle stretching once it eases.'],
    avoid: ['Heavy lifting or hard exercise until it feels better.', 'Ibuprofen on an empty stomach.'],
    dr: ['Body pain with fever, rash or bleeding (possible dengue)', 'Severe pain after a fall, or you cannot move the area', 'Swelling, redness and warmth that keeps spreading', 'Chest pain: go to the ER now'] },
  tooth: { e: '🦷', n: 'Toothache', m: ['para', 'ibu'], drink: ['Bottled water'], food: ['Soft food (lugaw, soup)'], other: [],
    eat: ['Rinse with warm salt water.', 'Eat soft food and chew on the other side.', 'Brush and floss gently around the tooth.'],
    avoid: ['Very hot, cold or sweet food and drinks.', 'Putting a pain tablet on the gum. It can burn it.'],
    dr: ['See a dentist soon. Pain pills only cover it for a while.', 'Swollen face or jaw, fever, or trouble opening your mouth: go today', 'Trouble swallowing or breathing: go to the ER'] },
  constip: { e: '🧻', n: 'Constipation', m: [], drink: ['Bottled water', 'Papaya or prune juice'], food: ['Papaya or bananas', 'Vegetables', 'Oatmeal'], other: [],
    eat: ['Drink more water through the day.', 'Eat fiber: fruit, vegetables, oats.', 'Walk around. Moving helps your gut.'],
    avoid: ['Holding it in when you feel the urge.', 'Lots of processed or fried food.', 'Laxatives every day without a doctor.'],
    dr: ['Severe belly pain, vomiting, or a swollen belly', 'Blood in the stool, or black stool', 'Nothing for more than a week, or it keeps happening'] },
  dizzy: { e: '😵', n: 'Dizziness', m: ['ors'], drink: ['Bottled water'], food: ['A light snack'], other: [],
    eat: ['Sit or lie down right away until it passes.', 'Sip water. Eat something if you skipped a meal.', 'Stand up slowly.'],
    avoid: ['Driving or riding while dizzy.', 'Alcohol and lots of coffee.'],
    dr: ['Fainting, chest pain, or a racing heartbeat: go to the ER', 'Sudden weakness or numbness on one side, slurred speech, or a drooping face: go to the ER now', 'A very bad headache with it', 'It keeps coming back'] },
  cut: { e: '🩹', n: 'Small cut or scrape', m: [], drink: [], food: [], other: ['Antiseptic (like povidone-iodine)', 'Adhesive bandages', 'Clean gauze'],
    eat: ['Wash it with clean water and soap.', 'Press with a clean cloth to stop bleeding.', 'Cover with a clean bandage and change it daily.'],
    avoid: ['Dirty cloths on the wound.', 'Picking at the scab.'],
    dr: ['Bleeding that will not stop after 10 minutes of pressure', 'A deep or gaping cut, or something stuck in it', 'A cut from something rusty, or an animal bite or scratch (you may need a tetanus or rabies shot)', 'Redness, swelling, pus or fever a few days later'] },
  eyes: { e: '👀', n: 'Sore or tired eyes', m: [], drink: ['Bottled water'], food: [], other: ['Lubricating eye drops (ask the pharmacist)'],
    eat: ['Every 20 minutes on a screen, look at something far away for 20 seconds.', 'Put a cool, clean cloth over closed eyes.', 'Blink often.'],
    avoid: ['Rubbing your eyes.', 'Sharing towels or eye drops.', 'Contact lenses while your eyes are red.'],
    dr: ['Eye pain, sudden blurry vision, or seeing flashes', 'Red eye with thick discharge, or it is getting worse', 'Something got in your eye, or a chemical splash: rinse with water and go now'] },
  sleep: { e: '😴', n: "Can't sleep", m: [], drink: ['Caffeine-free tea or warm milk'], food: [], other: [],
    eat: ['Sleep and wake up at the same time every day.', 'Put your phone away 30 minutes before bed.', 'Keep the room dark, cool and quiet.'],
    avoid: ['Coffee, energy drinks and soda after lunch.', 'Sleeping pills without a doctor. Some clash with ADHD medicines.', 'Long naps late in the afternoon.'],
    dr: ['Trouble sleeping most nights for more than 2 to 3 weeks', 'Ask your doctor if the timing of your ADHD medicine could be keeping you awake'] },
};
// His own version of a common medicine (brand name, how he takes it, note). Safety limits stay fixed.
export const lib = (doc, id) => ({ ...LIB[id], ...(((doc && doc.cfg.libOv) || {})[id] || {}) });
export const libPills = id => { const L = LIB[id], c = L.course, per = c ? (c.type === 'hours' ? c.cnt : c.times.length) : 2; return L.dose * per * L.days; };
export function fromLib(doc, id, mode) {
  const L = lib(doc, id), c = L.course, t = today().ymd;
  const e = { id: C.rid('m'), name: L.n, perDose: L.dose, times: [], stock0: 0, stockAt: Date.now(), price: (doc.cfg.libPrice || {})[id] || 0, lib: id, maxDay: L.max, maxPer: L.mp, minGap: L.gap, start: t, dur: null, sched: { type: 'prn' }, prn: true, notes: L.how || L.notes || '', purpose: '', every: L.every || 0, followDays: L.days || 3, isNew: true };
  if (mode === 'course' && c) { e.prn = false; e.dur = L.days; if (c.type === 'hours') { e.sched = { type: 'hours', gap: c.gap, cnt: c.cnt, first: c.first }; e.times = C.hrs(c.first, c.gap, c.cnt); } else { e.sched = { type: 'daily' }; e.times = [...c.times]; } }
  return e;
}

/* ---------- medicine details ---------- */
export function medDetails(doc, m, admin) {
  const t = today().ymd, st = C.stockOf(doc, m), dl = m.prn ? null : C.daysLeft(doc, m, t), l = C.lastTake(doc, m), n24 = C.pills24(doc, m, Date.now());
  const course = C.courseText(m, t), next = m.prn ? null : nextDose(doc, m);
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  return `<dl class="kv">
    ${row('For', esc(m.purpose))}${row('How to take', esc(m.notes))}
    ${row('Each time', pl(m.perDose, 'pill'))}${row('When', esc(C.schedText(m)))}${row('Course', course)}
    ${row('Next dose', next)}
    ${row('Pills left', st + (dl ? (dl.days === Infinity ? ' · enough' : ` · lasts ${pl(dl.days, 'day')}`) : ''))}
    ${row('Runs out', dl && dl.out ? C.fmtD(dl.out) : '')}
    ${row('Price per pill', m.price ? money(doc, m.price) : (admin ? '<span class="mini">not set</span>' : ''))}
    ${row('Last taken', l ? fmtDT(l) + ' (' + ago(l) + ')' : 'Not yet')}
    ${row('Last 24 hours', (m.maxDay || m.prn) ? `${n24}${m.maxDay ? ' of ' + m.maxDay + ' max' : ''} pills` : '')}
    ${row('Wait between doses', m.minGap ? m.minGap + ' hours' : '')}
  </dl>`;
}
export function nextDose(doc, m) {
  const n = today();
  for (let i = 0; i < 60; i++) { const d = C.addD(n.ymd, i); for (const t of C.timesOn(m, d)) { if (C.takenAt(doc, C.dkey(d, m.id, t))) continue; if (i === 0 && C.mins(t) < n.min - 60) continue; return (i === 0 ? 'Today ' : i === 1 ? 'Tomorrow ' : C.fmtD(d) + ', ') + C.fmtT(t); } }
  return '';
}
export function guard(doc, m) {
  const n = C.pills24(doc, m, Date.now());
  if (m.maxDay && n + m.perDose > m.maxDay) return `STOP. Taking this would go over the limit for ${m.name} (${m.maxDay} pills in 24 hours). You already took ${n}.`;
  const l = C.lastTake(doc, m);
  if (m.minGap && l && Date.now() - l < m.minGap * 36e5) return `TOO SOON. You took ${m.name} ${ago(l)}. Wait until ${tm(l + m.minGap * 36e5)}.`;
  return '';
}

/* ---------- money (per pill) ---------- */
export function moneyHtml(doc, admin) {
  const t = today().ymd, meds = C.medList(doc).filter(m => !m.prn);
  if (!meds.length) return `<h1>Money</h1><div class="empty">Add a medicine first.</div>`;
  const p = C.plan(doc, t), M = x => money(doc, x);
  const line = (r, pills, cost) => `<div class="row"><span>${esc(r.m.name)}<br><span class="mini">${pl(pills, 'pill')} × ${r.price ? M(r.price) : '?'}</span></span><b>${r.price ? M(cost) : '—'}</b></div>`;
  const now = p.rows.filter(r => r.nowPills), pay = p.rows.filter(r => r.payPills);
  return `<h1>Money</h1><p class="sub">Paydays: the ${doc.cfg.paydays.join(' and ')}. Prices are per pill.</p>
  ${p.noPrice.length ? `<button class="alert" data-a="edit" data-id="${p.rows.find(r => !r.price).m.id}"><i>✏️</i><span>Add the price per pill for ${esc(p.noPrice.join(', '))}<small>Then all the money numbers will be filled in.</small></span></button>` : ''}
  ${now.length ? `<div class="card" style="border-color:var(--bad)"><div class="row"><b>🛒 Buy before payday</b><span class="pill bad">${p.toPay ? pl(p.toPay, 'day') + ' to payday' : 'today'}</span></div>
    <div class="big">${M(p.nowTotal)}</div><p class="mini" style="margin:0 0 8px">You'll run out before ${C.fmtD(p.p1)}.</p>${now.map(r => line(r, r.nowPills, r.nowCost)).join('')}
    <button class="btn full" style="margin-top:12px" data-a="buy">I bought pills</button></div>`
    : `<div class="alert ok"><i>✅</i><span>You have enough pills until payday (${C.fmtD(p.p1)}).</span></div>`}
  <div class="card"><div class="row"><b>💰 ${p.toPay ? 'On payday, ' + C.fmtD(p.p1) : 'Today is payday!'}</b><span class="pill warn">${p.toPay ? 'in ' + pl(p.toPay, 'day') : 'now'}</span></div>
    <p class="mini" style="margin:6px 0 0">Set aside this much for meds:</p><div class="big">${M(p.payTotal)}</div>
    <p class="mini" style="margin:0 0 8px">Covers you until the next payday, ${C.fmtD(p.p2)} (${pl(p.cycle, 'day')}).</p>
    ${pay.map(r => line(r, r.payPills, r.payCost)).join('') || '<p class="sub">Nothing to buy. You already have enough.</p>'}</div>
  <h2>Your pills</h2>
  ${p.rows.map(r => { const d = r.dl.days, cls = d <= 3 ? 'bad' : d <= 7 ? 'warn' : 'ok';
    return `<button class="card" style="width:100%;text-align:left;font:inherit;color:inherit" data-a="det" data-id="${r.m.id}"><div class="row"><b>${esc(r.m.name)}</b><span class="pill ${cls}">${d === Infinity ? 'Enough' : pl(d, 'day') + ' left'}</span></div>
    <div class="row mini"><span>${pl(r.stock, 'pill')} left${r.dl.out ? ' · out ' + C.fmtD(r.dl.out) : ''}</span><span>${r.price ? M(r.price) + ' each' : 'no price'}</span></div>
    ${r.price ? `<div class="row mini"><span>Next 30 days: ${pl(r.month, 'pill')}</span><span>${M(r.monthCost)}</span></div>` : ''}</button>`; }).join('')}
  ${p.monthTotal ? `<div class="card"><div class="row"><b>Meds for the next 30 days</b><b>${M(p.monthTotal)}</b></div></div>` : ''}
  <div class="card"><div class="row"><b>Spent since ${C.fmtD(p.since)}</b><b>${M(p.spent)}</b></div>
  ${C.live(doc.buys).sort((a, b) => b.t - a.t).slice(0, admin ? 30 : 5).map(b => { const m = doc.meds[b.med]; return `<div class="row mini"><span>${fmtDT(b.t)} · ${esc(m ? m.name : 'Medicine')} × ${b.pills}${admin ? ` <button class="btn ghost" style="padding:2px 8px;font-size:12px" data-a="delbuy" data-id="${b.id}">remove</button>` : ''}</span><span>${M(b.cost || 0)}</span></div>`; }).join('') || '<p class="mini">No purchases logged yet.</p>'}
  <button class="btn ghost full" style="margin-top:12px" data-a="buy">+ I bought pills</button></div>`;
}

/* ---------- "I bought pills" sheet ---------- */
let B = null, sheetKind = null, CX = null;
export function openBuy(cx, medId) {
  CX = cx; const meds = C.medList(cx.doc());
  if (!meds.length) return toast('Add a medicine first.');
  const m = meds.find(x => x.id === medId) || meds.find(x => !x.prn) || meds[0];
  B = { med: m.id, pills: '', cost: '' }; sheetKind = 'buy'; drawBuy();
}
function drawBuy() {
  const doc = CX.doc(), m = doc.meds[B.med];
  openSheet(`<h1 style="margin-top:0">I bought pills 🛒</h1>
  <label>Which medicine?</label><div class="opt">${C.medList(doc).map(x => `<button class="${x.id === B.med ? 'on' : ''}" data-a="bm" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
  <label>How many pills?</label><input type="number" id="b_pills" min="1" inputmode="numeric" value="${B.pills}" placeholder="e.g. 30">
  <label>Total I paid (${esc(doc.cfg.cur)})</label><input type="number" id="b_cost" min="0" step="0.01" inputmode="decimal" value="${B.cost}" placeholder="${m.price ? 'about ' + money(doc, m.price) + ' per pill' : 'e.g. 360'}">
  <p class="mini" id="b_hint">${buyHint()}</p>
  <button class="btn full big" data-a="buysave">Save</button><button class="btn ghost full" style="margin-top:10px" data-a="close">Cancel</button>`);
}
function buyHint() {
  const doc = CX.doc(), m = doc.meds[B.med], n = +B.pills || 0, c = +B.cost;
  if (!n) return 'Your pill count and price per pill will update by themselves.';
  if (B.cost === '' && m.price) return `At ${money(doc, m.price)} per pill that is about ${money(doc, n * m.price)}.`;
  return c ? `That is ${money(doc, c / n)} per pill.` : '';
}

/* ---------- medicine editor ---------- */
let E = null;
const FQ = [['daily', 'Every day'], ['everyN', 'Every few days'], ['weekly', 'Certain weekdays'], ['hours', 'Every few hours'], ['prn', 'Only when needed']];
export function openEditor(cx, id, preset) {
  CX = cx; const doc = cx.doc(), m = id && doc.meds[id];
  E = preset || (m ? JSON.parse(JSON.stringify(m)) : { id: C.rid('m'), name: '', purpose: '', notes: '', perDose: 1, times: ['08:00'], stock0: 0, stockAt: Date.now(), price: 0, isNew: true, sched: { type: 'daily' }, start: today().ymd, dur: null, maxDay: null, minGap: 0 });
  if (!E.sched) E.sched = { type: E.prn ? 'prn' : 'daily' };
  if (!E.start) E.start = today().ymd;
  E._stock = E.isNew && !m ? (E.stock0 || 0) : C.stockOf(doc, m || E);
  sheetKind = 'edit'; drawEditor();
}
function drawEditor() {
  const e = E, s = e.sched, t = s.type, doc = CX.doc();
  openSheet(`<h1 style="margin-top:0">${e.isNew ? 'Add medicine' : 'Edit medicine'}</h1>
  ${e.isNew ? `<label>Common medicines (fills in the safe limits)</label><select data-s="lib"><option value="">Choose one, or type your own below</option>${Object.entries(LIB).map(([k, l]) => `<option value="${k}" ${e.lib === k ? 'selected' : ''}>${l.n}</option>`).join('')}</select>` : ''}
  <label>Name</label><input type="text" id="f_name" value="${esc(e.name)}" placeholder="e.g. Losartan 50 mg">
  <label>What is it for? <span class="mini">(optional)</span></label><input type="text" id="f_for" value="${esc(e.purpose || '')}" placeholder="e.g. Blood pressure">
  <label>How to take it <span class="mini">(optional, shows in reminders)</span></label><input type="text" id="f_notes" value="${esc(e.notes || '')}" placeholder="e.g. After breakfast, with water">
  <label>Pills each time</label><input type="number" id="f_per" min="1" value="${e.perDose}">
  <label>How often?</label><div class="opt">${FQ.map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-a="fq" data-v="${k}">${l}</button>`).join('')}</div>
  ${t === 'everyN' ? `<label>Every how many days?</label><input type="number" id="f_n" min="2" max="60" value="${s.n || 2}">` : ''}
  ${t === 'weekly' ? `<label>Which days?</label><div class="opt">${C.WD.map((d, i) => `<button class="${(s.days || []).includes(i) ? 'on' : ''}" data-a="wd" data-v="${i}">${d}</button>`).join('')}</div>` : ''}
  ${t === 'hours' ? `<div class="two"><div><label>Every how many hours?</label><input type="number" id="f_gap" min="1" max="12" value="${s.gap || 6}"></div><div><label>Doses a day</label><input type="number" id="f_cnt" min="1" max="6" value="${s.cnt || 3}"></div></div><label>First dose at</label><input type="time" id="f_first" value="${s.first || '08:00'}">` : ''}
  ${(t === 'daily' || t === 'everyN' || t === 'weekly') ? `<label>What time(s)?</label><div class="tc">${e.times.map((x, i) => `<span>${C.fmtT(x)}<button data-a="rmt" data-i="${i}" aria-label="Remove">×</button></span>`).join('')}</div><div class="add"><input type="time" id="f_t" value="20:00"><button class="btn ghost" data-a="addt">Add time</button></div>` : ''}
  ${t === 'prn' ? `<p class="sub">It shows under "As needed" on Today. The app warns before too much is taken.</p>
   <div class="two"><div><label>After I take it, remind me again every (hours)</label><input type="number" id="f_every" min="0" max="48" step="0.5" placeholder="don't remind" value="${e.every || ''}"></div><div><label>For up to (days)</label><input type="number" id="f_fdays" min="1" max="14" value="${e.followDays || 3}"></div></div>` : ''}
  <div class="two"><div><label>Start date</label><input type="date" id="f_start" value="${e.start}"></div><div><label>For how many days?</label><input type="number" id="f_dur" min="1" placeholder="ongoing" value="${e.dur || ''}"></div></div>
  <details ${(e.maxDay || e.minGap) ? 'open' : ''}><summary>Safety limits</summary><label>Most pills in 24 hours</label><input type="number" id="f_max" min="1" placeholder="no limit" value="${e.maxDay || ''}"><label>Wait at least (hours) between doses</label><input type="number" id="f_mg" min="0" step="0.5" placeholder="none" value="${e.minGap || ''}"></details>
  <div id="hint">${edHint()}</div>
  <details open><summary>Pills and price</summary>
  <div class="two"><div><label>Pills I have now</label><input type="number" id="f_stock" min="0" value="${e._stock}"></div><div><label>Price per pill (${esc(doc.cfg.cur)})</label><input type="number" id="f_price" min="0" step="0.01" value="${e.price || ''}" placeholder="0"></div></div>
  <div class="calc"><span class="mini">Only know the box price? Type it here and I'll work out the price per pill.</span><div class="two"><input type="number" id="f_pack" min="0" step="0.01" placeholder="Box price"><input type="number" id="f_packn" min="1" placeholder="Pills in box"></div></div></details>
  <button class="btn full big" style="margin-top:18px" data-a="savem">Save</button>
  <button class="btn ghost full" style="margin-top:10px" data-a="close">Cancel</button>
  ${e.isNew ? '' : '<button class="btn red full" style="margin-top:10px" data-a="delm">Delete this medicine</button>'}`);
}
function edHint() {
  const e = E, t = e.sched.type, pd = t === 'prn' ? 0 : e.times.length * e.perDose;
  const w = (e.maxDay && pd > e.maxDay) ? `That is ${pd} pills a day. The safe limit is ${e.maxDay}. Lower it before saving.` : (e.maxPer && e.perDose > e.maxPer) ? `The usual dose is up to ${e.maxPer} at a time.` : '';
  return (t === 'hours' ? `<div class="tc">${e.times.map(x => `<span>${C.fmtT(x)}</span>`).join('')}</div>` : '') + (w ? `<div class="alert bad"><i>⚠️</i><span>${w}</span></div>` : '');
}
function grab() {
  const v = id => { const x = $('#' + id); return x ? x.value : null; }, e = E, s = e.sched;
  if (v('f_name') !== null) e.name = v('f_name').trim();
  if (v('f_for') !== null) e.purpose = v('f_for').trim();
  if (v('f_notes') !== null) e.notes = v('f_notes').trim();
  if (v('f_per') !== null) e.perDose = Math.max(1, parseInt(v('f_per')) || 1);
  if (v('f_n') !== null) s.n = Math.max(2, parseInt(v('f_n')) || 2);
  if (v('f_gap') !== null) { s.gap = Math.max(1, parseFloat(v('f_gap')) || 6); s.cnt = Math.min(6, Math.max(1, parseInt(v('f_cnt')) || 1)); s.first = v('f_first') || '08:00'; e.times = C.hrs(s.first, s.gap, s.cnt); }
  if (v('f_start') !== null) e.start = v('f_start') || today().ymd;
  if (v('f_dur') !== null) e.dur = parseInt(v('f_dur')) || null;
  if (v('f_max') !== null) { e.maxDay = parseInt(v('f_max')) || null; e.minGap = parseFloat(v('f_mg')) || 0; }
  if (v('f_stock') !== null) e._stock = Math.max(0, parseInt(v('f_stock')) || 0);
  if (v('f_price') !== null) e.price = Math.max(0, parseFloat(v('f_price')) || 0);
  if (v('f_every') !== null) { e.every = Math.max(0, parseFloat(v('f_every')) || 0); e.followDays = Math.min(14, Math.max(1, parseInt(v('f_fdays')) || 3)); }
}
function checkMed(e) {
  e.prn = e.sched.type === 'prn';
  if (!e.name) return 'Please type the medicine name.';
  if (!e.prn && !e.times.length) return 'Add at least one time.';
  if (e.sched.type === 'weekly' && !(e.sched.days || []).length) return 'Pick at least one day.';
  const tot = e.prn ? 0 : e.times.length * e.perDose;
  if (e.maxDay && tot > e.maxDay) return `That is ${tot} pills a day, over the limit of ${e.maxDay}.`;
  if (e.maxPer && e.perDose > e.maxPer) return `The usual dose is up to ${e.maxPer} at a time.`;
  if (e.minGap && e.times.length > 1) { const a = e.times.map(C.mins).sort((x, y) => x - y); let g = 1440 - a[a.length - 1] + a[0]; for (let i = 1; i < a.length; i++) g = Math.min(g, a[i] - a[i - 1]); if (g < e.minGap * 60) return `Two doses are less than ${e.minGap} hours apart. Spread them out.`; }
  return '';
}

/* ---------- shared clicks and changes; return true when handled ---------- */
export function uiClick(a, b) {
  const doc = CX && CX.doc();
  if (a === 'close') { closeSheet(); return true; }
  if (sheetKind === 'buy') {
    if (a === 'bm') { readBuy(); B.med = b.dataset.id; drawBuy(); return true; }
    if (a === 'buysave') {
      readBuy(); const n = parseInt(B.pills) || 0; if (n < 1) { say('How many pills?', 'Type how many pills you bought.', '🛒'); return true; }
      const m = doc.meds[B.med], cost = B.cost === '' ? n * (m.price || 0) : Math.max(0, parseFloat(B.cost) || 0), now = Date.now();
      const id = C.rid('b'); doc.buys[id] = { id, med: m.id, pills: n, cost, t: now, d: today().ymd, u: now };
      if (B.cost !== '' && cost > 0) doc.meds[m.id] = { ...m, price: Math.round(cost / n * 100) / 100, u: now };
      act(doc, '🛒', `Bought ${pl(n, 'pill')} of ${m.name}${cost ? ' for ' + money(doc, cost) : ''}`); closeSheet(); CX.save(); toast(`Added ${pl(n, 'pill')} of ${m.name} 👍`); return true;
    }
  }
  if (sheetKind !== 'edit' || !E) return false;
  if (a === 'addt') { grab(); const t = $('#f_t').value; if (t && !E.times.includes(t)) { E.times.push(t); E.times.sort(); } drawEditor(); return true; }
  if (a === 'rmt') { grab(); E.times.splice(+b.dataset.i, 1); drawEditor(); return true; }
  if (a === 'fq') {
    grab(); const t = b.dataset.v, ns = { type: t };
    if (t === 'everyN') ns.n = 2; if (t === 'weekly') ns.days = [1];
    if (t === 'hours') { Object.assign(ns, { gap: 6, cnt: 3, first: '08:00' }); E.times = C.hrs('08:00', 6, 3); }
    else if (t === 'prn') E.times = []; else if (!E.times.length) E.times = ['08:00'];
    E.sched = ns; drawEditor(); return true;
  }
  if (a === 'wd') { grab(); const d = +b.dataset.v, s = E.sched, c = s.days || []; s.days = c.includes(d) ? c.filter(x => x !== d) : [...c, d]; drawEditor(); return true; }
  if (a === 'savem') {
    grab(); const err = checkMed(E); if (err) { say('Almost there', err, '✏️'); return true; }
    const now = Date.now(), old = doc.meds[E.id], m = { ...E }; delete m.isNew; delete m._stock;
    if (!old) m.c = now;
    const cur = old ? C.stockOf(doc, old) : null;
    if (!old || E._stock !== cur) { m.stock0 = E._stock; m.stockAt = now; }
    m.u = now; doc.meds[m.id] = m; act(doc, '💊', `${old ? 'Edited' : 'Added'} ${m.name}`); closeSheet(); CX.save(); toast('Saved ✓'); return true;
  }
  if (a === 'delm') { const id = E.id, nm = E.name; ask({ title: `Delete ${esc(nm)}?`, text: 'Its reminders will stop. Past doses stay in the history.', ok: 'Delete', danger: true, icon: '🗑️' }).then(y => { if (y) { doc.meds[id] = { ...doc.meds[id], del: true, u: Date.now() }; act(doc, '🗑️', `Deleted ${nm}`); closeSheet(); CX.save(); } }); return true; }
  return false;
}
function readBuy() { const p = $('#b_pills'), c = $('#b_cost'); if (p) B.pills = p.value; if (c) B.cost = c.value; }
export function uiChange(ev) {
  if (!ev.target.closest('#sheet')) return false;
  if (sheetKind === 'buy') { readBuy(); const h = $('#b_hint'); if (h) h.textContent = buyHint(); return true; }
  if (sheetKind !== 'edit' || !E) return false;
  if (ev.target.id === 'f_pack' || ev.target.id === 'f_packn') {
    const pr = parseFloat($('#f_pack').value), n = parseInt($('#f_packn').value);
    if (pr > 0 && n > 0) { $('#f_price').value = Math.round(pr / n * 100) / 100; }
  }
  grab();
  if (ev.target.dataset.s === 'lib') { const id = ev.target.value; if (id) { const keep = E.id; E = Object.assign(fromLib(CX.doc(), id, 'prn'), { id: keep, _stock: E._stock }); drawEditor(); } return true; }
  const h = $('#hint'); if (h) h.innerHTML = edHint();
  return true;
}
// live update while typing in the buy sheet and price calculator
export function uiInput(ev) { if (ev.target.closest('#sheet') && (sheetKind === 'buy' || ev.target.id === 'f_pack' || ev.target.id === 'f_packn')) uiChange(ev); }

/* ======================================================================
   v6 shared screens: profile, sick logbook, buy list
   ====================================================================== */
let ROLE = 'phone';
export function act(doc, ic, text) { const t = Date.now(), id = C.rid('a'); doc.act[id] = { id, t, ic, text, by: ROLE, u: t }; }
export function setCtx(cx, role) { CX = cx; ROLE = role; }
const nowMs = () => Date.now();
const tel = p => p ? `<a href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}" style="color:var(--acc);font-weight:700">${esc(p)}</a>` : '';
export const age = b => { if (!b) return ''; const d = new Date(b + 'T00:00'), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a >= 0 && a < 130 ? a : ''; };

/* ---------- profile ---------- */
const PF = [
  ['Me', [['full', 'Full name'], ['birth', 'Birthday', 'date'], ['sex', 'Sex', 'sel', ['', 'Male', 'Female', 'Prefer not to say']], ['height', 'Height (cm)', 'number'], ['weight', 'Weight (kg)', 'number'], ['phone', 'My phone', 'tel'], ['address', 'Address']]],
  ['Health', [['blood', 'Blood type', 'sel', ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', "Don't know"]], ['allergies', 'Allergies (medicines, food)', 'area'], ['conditions', 'Health conditions', 'area'], ['surgeries', 'Past surgeries or hospital stays', 'area']]],
  ['Doctor', [['doctor', "Doctor's name"], ['clinic', 'Clinic or hospital'], ['docphone', "Doctor's phone", 'tel']]],
  ['Emergency contact', [['emname', 'Name'], ['emrel', 'Relationship'], ['emphone', 'Phone', 'tel']]],
  ['Insurance', [['hmo', 'HMO or insurance'], ['hmono', 'Member number']]],
  ['Notes', [['notes', 'Anything else', 'area']]],
];
export function profileHtml(doc, admin) {
  const p = doc.prof || {}, name = p.full || doc.cfg.name || 'Your profile', a = age(p.birth), meds = C.medList(doc);
  const val = (k, t) => p[k] ? (t === 'tel' ? tel(p[k]) : t === 'date' ? new Date(p[k] + 'T00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : esc(p[k]).replace(/\n/g, '<br>')) : '';
  const filled = PF.flatMap(s => s[1]).filter(([k]) => p[k]).length;
  const sec = ([title, fields]) => { const rows = fields.filter(([k]) => p[k]); return rows.length ? `<div class="card"><b>${title}</b><dl class="kv">${rows.map(([k, l, t]) => `<dt>${l}</dt><dd>${val(k, t)}</dd>`).join('')}</dl></div>` : ''; };
  const warn = p.allergies ? `<div class="alert bad"><i>⚠️</i><span>Allergies<small>${esc(p.allergies)}</small></span></div>` : '';
  return `<div class="card" style="text-align:center"><div class="avatar big">${esc((name[0] || '🙂').toUpperCase())}</div><h1 style="margin:8px 0 0">${esc(name)}</h1>
    <p class="mini" style="margin:2px 0 0">${[a !== '' ? a + ' years old' : '', p.blood ? '🩸 ' + esc(p.blood) : '', p.height ? p.height + ' cm' : '', p.weight ? p.weight + ' kg' : ''].filter(Boolean).join(' · ') || (admin ? 'Nothing filled in yet' : 'Tap Edit to fill in your info')}</p>
    ${p.u ? `<p class="mini" style="margin:4px 0 0">Updated ${ago(p.u)}${p.by === 'admin' ? ' (by helper)' : ''}</p>` : ''}
    <button class="btn ${filled ? 'ghost' : ''} full" style="margin-top:12px" data-a="profedit">${filled ? '✏️ Edit' : '✏️ Fill in my info'}</button></div>
    ${warn}${PF.map(sec).join('')}
    ${meds.length ? `<div class="card"><b>Medicines</b>${meds.map(m => `<div class="row mini"><span>💊 ${esc(m.name)}${m.purpose ? ' · ' + esc(m.purpose) : ''}</span><span>${esc(C.schedText(m).replace(/^Every day at /, ''))}</span></div>`).join('')}</div>` : ''}
    <p class="mini">🔒 Only you and your helper can see this.</p>`;
}
export function openProfileEdit() {
  const p = CX.doc().prof || {};
  const field = ([k, l, t, opts]) => `<label>${l}</label>${t === 'area' ? `<textarea id="pf_${k}" rows="2">${esc(p[k] || '')}</textarea>`
    : t === 'sel' ? `<select id="pf_${k}">${opts.map(o => `<option ${p[k] === o ? 'selected' : ''} value="${esc(o)}">${o || '—'}</option>`).join('')}</select>`
    : `<input type="${t || 'text'}" id="pf_${k}" value="${esc(p[k] || '')}" ${t === 'number' ? 'inputmode="decimal"' : ''}>`}`;
  sheetKind = 'prof';
  openSheet(`<h1 style="margin-top:0">✏️ ${ROLE === 'admin' ? 'His' : 'My'} profile</h1><p class="sub">Fill in what you know. Skip anything you like.</p>
   ${PF.map(([title, fields]) => `<details class="sec card" ${title === 'Me' ? 'open' : ''}><summary><b>${title}</b></summary><div>${fields.map(field).join('')}</div></details>`).join('')}
   <p class="mini" id="pf_state" style="text-align:center">Changes save automatically as you type.</p><button class="btn full big" data-a="profsave">Done</button>`);
}

/* ---------- sick logbook ---------- */
export const SEV = ['', 'Mild', 'Moderate', 'Severe'], SEVE = ['', '🙂', '😣', '😫'];
export const ST = { better: ['🙂', 'Better'], same: ['😐', 'Same'], worse: ['😣', 'Worse'], gone: ['✅', 'All better'], note: ['📝', 'Note'], took: ['💊', 'Took'] };
export const symOf = s => U_SYM(s.sym) || { e: '🤒', n: s.name || 'Not feeling well' };
const U_SYM = k => SYM[k];
export const lastSt = s => { const u = (s.ups || []).filter(x => x.st !== 'note' && x.st !== 'took'); return u.length ? u[u.length - 1].st : ''; };
export function sickCard(doc, s, compact) {
  const y = symOf(s), st = lastSt(s), open = s.open === true;
  return `<button class="card logitem" data-a="sickopen" data-id="${s.id}"><div class="row"><b>${y.e} ${esc(s.name || y.n)}</b>${open ? `<span class="pill ${st === 'worse' || s.sev === 3 ? 'bad' : 'warn'}">${st ? ST[st][0] + ' ' + ST[st][1] : 'Ongoing'}</span>` : '<span class="pill ok">Over</span>'}</div>
   <p class="mini" style="margin:4px 0 0">${fmtDT(s.t)}${s.sev ? ' · ' + SEVE[s.sev] + ' ' + SEV[s.sev] : ''}${open ? ' · ' + ago(s.t) : s.end ? ' · lasted ' + dur(s.end - s.t) : ''}</p>
   ${!compact && s.note ? `<p class="mini" style="margin:4px 0 0">“${esc(s.note)}”</p>` : ''}</button>`;
}
const dur = ms => { const h = ms / 36e5; return h < 1 ? Math.max(1, Math.round(h * 60)) + ' min' : h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' days'; };
export function openSick(id) {
  const doc = CX.doc(), s = doc.sick[id]; if (!s) return;
  const y = symOf(s), helper = doc.cfg.helper || 'Helper', who = doc.cfg.name || 'He';
  const ev = [{ t: s.t, h: `<b>Started</b>${s.sev ? ' · ' + SEVE[s.sev] + ' ' + SEV[s.sev] : ''}${s.note ? `<br><span class="mini">“${esc(s.note)}”</span>` : ''}` },
    ...(s.took || []).map(x => ({ t: x.t, h: `💊 Took <b>${esc(x.name)}</b>` })),
    ...(s.ups || []).map(u => ({ t: u.t, h: `${ST[u.st] ? ST[u.st][0] + ' <b>' + ST[u.st][1] + '</b>' : ''}${u.by === 'admin' ? ` <span class="mini">(${esc(helper)})</span>` : ''}${u.note ? `<br><span class="mini">“${esc(u.note)}”</span>` : ''}` }))].sort((a, b) => a.t - b.t);
  sheetKind = 'sick'; SICK = id;
  openSheet(`<h1 style="margin-top:0">${y.e} ${esc(s.name || y.n)}</h1><p class="sub">${s.open ? 'Ongoing since ' + fmtDT(s.t) : 'Over' + (s.end ? ' · lasted ' + dur(s.end - s.t) : '')}</p>
   <div class="card"><div class="tl">${ev.map(e => `<div><span class="mini">${fmtDT(e.t)}</span><br>${e.h}</div>`).join('')}</div></div>
   ${s.open ? (ROLE === 'phone' ? `<h2>How do you feel now?</h2><div class="opt" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${['better', 'same', 'worse', 'gone'].map(k => `<button data-a="sickup" data-st="${k}">${ST[k][0]} ${ST[k][1]}</button>`).join('')}</div>
      <input type="text" id="sk_note" placeholder="Add a note (optional)" style="margin-top:10px">`
     : `<h2>Send ${esc(who === 'He' ? 'him' : who)} a note</h2><textarea id="sk_note" rows="2" placeholder="e.g. Drink water and rest. Call me if it gets worse."></textarea><button class="btn full" style="margin-top:8px" data-a="sickup" data-st="note">Send note</button>
      <button class="btn ghost full" style="margin-top:8px" data-a="sickup" data-st="gone">Mark as over</button>`) : ''}
   ${ROLE === 'phone' ? `<button class="link" data-a="sickdel">Delete this entry</button>` : ''}`);
}
let SICK = null;

/* ---------- buy list ---------- */
let KINDSEL = 'other';
const KICON = { med: '💊', food: '🍌', drink: '🥤', other: '🛍️' };
export function buyHtml(doc, admin) {
  const t = today().ymd, p = C.plan(doc, t), low = p.rows.filter(r => r.dl.days <= doc.cfg.lowDays);
  const items = C.live(doc.shop), open = items.filter(s => !s.done).sort((a, b) => b.add - a.add), done = items.filter(s => s.done).sort((a, b) => b.done - a.done).slice(0, 15);
  const who = doc.cfg.helper || 'helper';
  return `<h1>🛒 ${admin ? 'His buy list' : 'Buy list'}</h1><p class="sub">${open.length + low.length ? pl(open.length + low.length, 'thing') + ' to get' : 'Nothing to buy right now 🎉'}</p>
  ${low.length ? `<h2>💊 Running low</h2><div class="card">${low.map(r => `<button class="check" data-a="buy" data-id="${r.m.id}"><span class="box" style="border-color:var(--bad)">!</span><span class="tx"><b>${esc(r.m.name)}</b> · ${r.dl.days === 0 ? 'out today' : pl(r.dl.days, 'day') + ' left'}<small>${esc(C.buyAdvice(r, p, x => money(doc, x)))} Tap when bought.</small></span></button>`).join('')}</div>` : ''}
  <h2>📝 To buy</h2><div class="card">${open.map(s => `<div class="row"><button class="check" data-a="shop" data-id="${s.id}"><span class="box">✓</span><span class="tx">${KICON[s.kind] || '🛍️'} ${esc(s.text)}<small>${s.why ? 'For ' + esc(s.why) + ' · ' : ''}${s.by === 'admin' ? 'added by ' + esc(who) + ' · ' : ''}${ago(s.add)}</small></span></button><button class="btn ghost" style="padding:4px 10px" data-a="delshop" data-id="${s.id}" aria-label="Remove">✕</button></div>`).join('') || '<p class="mini" style="margin:0">Empty. Add something below.</p>'}
   <div class="opt" style="margin-top:12px">${Object.entries(KICON).map(([k, i]) => `<button class="${KINDSEL === k ? 'on' : ''}" data-a="kind" data-k="${k}">${i} ${{ med: 'Medicine', food: 'Food', drink: 'Drink', other: 'Other' }[k]}</button>`).join('')}</div>
   <div class="add" style="margin-top:8px"><input type="text" id="newitem" placeholder="Add an item…"><button class="btn" data-a="additem">Add</button></div></div>
  ${done.length ? `<details class="sec card"><summary><b>✅ Bought recently</b></summary><div>${done.map(s => `<button class="check on" data-a="shop" data-id="${s.id}"><span class="box">✓</span><span class="tx">${KICON[s.kind] || '🛍️'} ${esc(s.text)}<small>${ago(s.done)} · tap to undo</small></span></button>`).join('')}</div></details>` : ''}
  <p class="mini">${admin ? 'He gets a reminder 1 hour after you add items, and every evening until they\'re ticked off.' : `I'll remind you about new items in 1 hour, and every evening until they're ticked off. ${esc(who)} can see this list.`}</p>`;
}

/* ---------- shared clicks for the screens above ---------- */
export async function v6Click(a, b) {
  if (!CX) return false;
  const doc = CX.doc(), t = nowMs();
  if (a === 'profedit') { openProfileEdit(); return true; }
  if (a === 'profsave') {
    const p = { ...(doc.prof || {}) };
    for (const [, fields] of PF) for (const [k] of fields) { const el = $('#pf_' + k); if (el) p[k] = el.value.trim(); }
    p.u = t; p.by = ROLE; doc.prof = p; act(doc, '👤', 'Updated the profile'); closeSheet(); CX.save(); toast('Profile saved ✓'); return true;
  }
  if (a === 'sickopen') { openSick(b.dataset.id); return true; }
  if (a === 'sickup') {
    const s = doc.sick[SICK]; if (!s) return true;
    const note = ($('#sk_note') && $('#sk_note').value.trim()) || '', st = b.dataset.st;
    if (st === 'note' && !note) { say('Type a note first', '', '📝'); return true; }
    const ns = { ...s, ups: [...(s.ups || []), { t, st, note, by: ROLE }], u: t };
    if (st === 'gone') { ns.open = false; ns.end = t; for (const m of C.medList(doc)) if (m.follow && m.follow.on && m.follow.sick === s.id) doc.meds[m.id] = { ...m, follow: { ...m.follow, on: false }, u: t }; }
    doc.sick[s.id] = ns; act(doc, symOf(s).e, `${s.name || symOf(s).n}: ${st === 'note' ? 'note: ' + note : ST[st][1].toLowerCase()}`); closeSheet(); CX.save();
    toast(st === 'gone' ? 'So glad you feel better 💖' : st === 'worse' ? 'Logged. Please take care 💖' : st === 'note' ? 'Note sent 💌' : 'Logged ✓');
    if (st === 'worse' && ROLE === 'phone') say('Feeling worse?', `Check the "See a doctor if" list for ${esc(symOf(s).n.toLowerCase())}. If any of those apply, see a doctor. ${doc.prof && doc.prof.emphone ? 'Your emergency contact: ' + tel(doc.prof.emphone) : ''}`, '🚑');
    return true;
  }
  if (a === 'sickdel') { const id = SICK; if (await ask({ icon: '🗑️', title: 'Delete this entry?', ok: 'Delete', danger: true })) { doc.sick[id] = { ...doc.sick[id], del: true, u: nowMs() }; closeSheet(); CX.save(); } return true; }
  if (a === 'kind') { KINDSEL = b.dataset.k; const v = $('#newitem') ? $('#newitem').value : ''; (CX.render || CX.save)(); const n = $('#newitem'); if (n) { n.value = v; n.focus(); } return true; }
  if (a === 'additem') {
    const v = ($('#newitem').value || '').trim(); if (!v) return true;
    const id = C.rid('s'); doc.shop[id] = { id, text: v, kind: KINDSEL, why: '', add: t, done: 0, by: ROLE, u: t }; act(doc, '🛒', `Added "${v}" to the buy list`); CX.save(); toast('Added 🛒');
    const n = $('#newitem'); if (n) n.focus(); return true;
  }
  if (a === 'shop') { const s = doc.shop[b.dataset.id]; if (s) { doc.shop[s.id] = { ...s, done: s.done ? 0 : t, u: t }; act(doc, s.done ? '↩️' : '✅', `${s.done ? 'Unticked' : 'Bought'} "${s.text}"`); CX.save(); if (!s.done) toast('Got it ✓'); } return true; }
  if (a === 'delshop') { const s = doc.shop[b.dataset.id]; if (s) { doc.shop[s.id] = { ...s, del: true, u: t }; CX.save(); } return true; }
  return false;
}

// profile fields save as he types
let pfT = null;
document.addEventListener('input', e => {
  if (!e.target.id || !e.target.id.startsWith('pf_') || !CX) return;
  clearTimeout(pfT); const st = $('#pf_state'); if (st) st.textContent = 'Saving…';
  pfT = setTimeout(() => {
    const doc = CX.doc(), p = { ...(doc.prof || {}) };
    for (const [, fields] of PF) for (const [k] of fields) { const el = $('#pf_' + k); if (el) p[k] = el.value.trim(); }
    p.u = Date.now(); p.by = ROLE; doc.prof = p; (CX.quiet || CX.save)(); const s2 = $('#pf_state'); if (s2) s2.textContent = 'Saved ✓';
  }, 700);
});
