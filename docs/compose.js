// Compose: a digital piano that records exactly what he plays.
// Notes sound while held and stop when released; chords, rests and the sustain pedal are recorded too.
// Every note autosaves to his account; drafts can be reopened and continued later; melodies play in Maestro.
import { ask } from './ui.js';
import * as P from './piano.js';
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
const nm = m => NAMES[m % 12].replace('#', '♯') + (Math.floor(m / 12) - 1);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const rid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MIN_D = 60, MAX_D = 12000, GAP = 300, PX = .09; // PX = pixels per millisecond in the piano roll

let X = null;   // { doc, quiet, act, redraw }
let C = null;   // the open melody: notes = [{ m, t, d }] (start and length in ms)
let timers = [], saveT = null, metroT = null, sess = null, raf = 0;
const held = new Map(); // pointerId -> { m, voice, ev }
export const init = ctx => { X = ctx; };
const comps = () => Object.values((X.doc().comp) || {}).filter(c => !c.del).sort((a, b) => b.u - a.u);
const when = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const end = () => C.notes.reduce((a, n) => Math.max(a, n.t + n.d), 0);
// Older saves were [midi, ms] one after another; newer ones are [midi, start, length].
export function events(notes) {
  if (!notes || !notes.length) return [];
  if (notes[0].length >= 3) return notes.map(([m, t, d]) => ({ m, t, d }));
  let t = 0; return notes.map(([m, ms]) => { const e = { m, t, d: ms }; t += ms; return e; });
}

/* ---------- open / new / save ---------- */
export function open(id) {
  stopAll();
  const c = id && (X.doc().comp || {})[id];
  const notes = c ? events(c.notes) : [];
  C = { id: c ? c.id : null, title: c ? c.title : '', bpm: (c && c.bpm) || 90, notes, oct: suggestOct(notes), rec: true, playing: false, sel: -1, metro: false, c: c ? c.c : 0, tools: false };
  sess = null;
}
const suggestOct = ns => { if (!ns.length) return 4; let best = 4, top = -1;
  for (const o of [4, 3, 5, 2, 6, 1]) { const lo = 12 * (o + 1), c = ns.filter(n => n.m >= lo && n.m <= lo + 19).length; if (c > top) { top = c; best = o; } } return best; };
function autosave() { clearTimeout(saveT); saveT = setTimeout(save, 800); }
function save(final) {
  clearTimeout(saveT);
  if (!C || !C.notes.length) return;
  const D = X.doc(), t = Date.now(), first = !C.id;
  if (first) { C.id = rid(); C.c = t; }
  const title = (C.title || '').trim() || `Idea · ${when(C.c)}`;
  D.comp = D.comp || {};
  D.comp[C.id] = { id: C.id, title, bpm: C.bpm, notes: C.notes.filter(n => n.d > 0).map(n => [n.m, Math.round(n.t), Math.round(n.d)]), c: C.c, u: t, by: 'phone' };
  if (first) X.act('🎼', `Started a new melody: “${title}”`);
  else if (final) X.act('🎼', `Saved melody “${title}” (${C.notes.length} notes)`);
  X.quiet();
  if (first) { const y = window.scrollY; X.redraw(); window.scrollTo(0, y); }
  const st = $('#cstate'); if (st) st.innerHTML = statusLine();
}
export function leave() { releaseAll(); if (C && C.notes.length) save(true); stopAll(); P.pedal(false); C = null; }

/* ---------- screen ---------- */
function keys() {
  const lo = 12 * (C.oct + 1), whites = [];
  for (let m = lo; whites.length < 12; m++) if (!isBlack(m)) whites.push(m);
  const w = 100 / whites.length, blacks = [];
  whites.forEach((m, i) => { if (i < whites.length - 1 && isBlack(m + 1)) blacks.push([m + 1, (i + 1) * w]); });
  return `<div class="piano compose" id="cpiano">${whites.map(m => `<div class="wk" data-cm="${m}" role="button" aria-label="${nm(m)}"><span>${NAMES[m % 12]}${NAMES[m % 12] === 'C' ? Math.floor(m / 12) - 1 : ''}</span></div>`).join('')}
    ${blacks.map(([m, x]) => `<div class="bk" data-cm="${m}" role="button" aria-label="${nm(m)}" style="left:calc(${x}% - ${w * .32}%);width:${w * .64}%"></div>`).join('')}</div>`;
}
function roll() {
  if (!C.notes.length) return `<div class="roll empty" id="roll"><span>🎵 Play anything. It draws itself here: hold a key longer for a longer note</span></div>`;
  const ms = C.notes.map(n => n.m), lo = Math.min(...ms) - 1, hi = Math.max(...ms) + 1, span = Math.max(6, hi - lo), H = 104;
  const bars = C.notes.map((n, i) => {
    const w = Math.max(10, (n.d || 120) * PX - 2), y = (hi - n.m) / span * (H - 18);
    return `<button class="rbar ${i === C.sel ? 'on' : ''} ${isBlack(n.m) ? 'blk' : ''} ${n.d ? '' : 'live'}" data-a="csel" data-i="${i}" style="left:${8 + n.t * PX}px;top:${y}px;width:${w}px" aria-label="${nm(n.m)}">${w > 26 ? nm(n.m) : ''}</button>`;
  }).join('');
  return `<div class="roll" id="roll"><div class="rin" style="width:${end() * PX + 60}px">${bars}<i class="phead" id="phead"></i></div></div>`;
}
const clock = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const statusLine = () => C.notes.length ? `${C.notes.length} notes · ${clock(end())} · <span class="ok">saved ✓</span>` : (C.rec ? 'Recording starts with your first note' : 'Paused: just play freely. Tap the red button to record');
export function view() {
  if (!C) open(null);
  return `<div class="gtop"><button class="back" data-a="cmback">← Back</button><span class="gbest">🎼 Compose</span><button class="mini-btn ghost" data-a="cnew">+ New</button></div>
  <div id="cbox">
   <input type="text" id="ctitle" value="${esc(C.title)}" placeholder="Untitled idea (tap to name it)" maxlength="60">
   ${roll()}
   <div class="cmain">
     <button class="cbtn" data-a="cundo" aria-label="Undo last note">↶<small>Undo</small></button>
     <button class="crec ${C.rec ? 'live' : ''}" data-a="crec" aria-label="${C.rec ? 'Pause recording' : 'Record'}"><i></i></button>
     <button class="cbtn" data-a="cplay" aria-label="Play">${C.playing ? '■' : '▶'}<small>${C.playing ? 'Stop' : 'Play'}</small></button>
   </div>
   <p class="cstat" id="cstate">${statusLine()}</p>
   <div class="cedit" id="cedit">${selTools()}</div>
   <div class="cbar2"><button class="cpedal ${P.isPedal() ? 'on' : ''}" data-a="cpedal">${P.isPedal() ? '🦶 Pedal ON' : '🦶 Sustain pedal'}</button><span class="mini">${nm(12 * (C.oct + 1))}–${nm(12 * (C.oct + 1) + 19)}</span><span><button class="mini-btn ghost" data-a="coct" data-d="-1" aria-label="Lower">◀</button> <button class="mini-btn ghost" data-a="coct" data-d="1" aria-label="Higher">▶</button></span></div>
   ${keys()}
   <details class="sec card ctoolbox" ${C.tools ? 'open' : ''}><summary><b>🛠 Tools</b></summary><div>
     <div class="srow"><span>Tempo</span><span class="cbpm"><button data-a="cbpm" data-d="-5">−</button><b id="cbpmv">${C.bpm}</b><button data-a="cbpm" data-d="5">+</button><small>bpm</small></span></div>
     <div class="srow"><span>Metronome</span><button class="toggle ${C.metro ? 'on' : ''}" data-a="cmetro"><i></i></button></div>
     <div class="srow"><span>Tidy the rhythm</span><button class="mini-btn ghost" data-a="csnap" ${C.notes.length > 1 ? '' : 'disabled'}>✨ Snap to beat</button></div>
   </div></details>
  </div>
  <h2>My melodies</h2><div id="cmlist">${listHtml()}</div>`;
}
function listHtml() {
  const list = comps();
  return list.length ? `<div class="list">${list.map(c => `<div class="lrow"><button class="lbody" data-a="copen" data-id="${c.id}"><span><b>${esc(c.title)}</b><span>${c.notes.length} notes · ${when(c.u)}${C && c.id === C.id ? ' · open now' : ''}</span></span></button><button class="mini-btn ghost" data-a="cgame" data-id="${c.id}" aria-label="Play in Maestro">🎹</button><button class="mini-btn ghost" data-a="cdel" data-id="${c.id}" aria-label="Delete">✕</button></div>`).join('')}</div>`
    : '<p class="mini">Your melodies appear here. Open one any time to keep adding to it.</p>';
}
// New data synced in (e.g. a melody saved on his other device): update the list without touching the keyboard.
export function refreshList() { const el = $('#cmlist'); if (el) el.innerHTML = listHtml(); }
const selTools = () => C.sel >= 0 && C.notes[C.sel] ? `<span class="mini"><b>${nm(C.notes[C.sel].m)}</b> · ${(C.notes[C.sel].d / 1000).toFixed(2)}s</span><button class="mini-btn ghost" data-a="clen" data-d="0.5">Shorter</button><button class="mini-btn ghost" data-a="clen" data-d="2">Longer</button><button class="mini-btn red" data-a="cdelnote">Delete</button><button class="mini-btn ghost" data-a="csel" data-i="${C.sel}">Done</button>` : '';
function refresh() {
  const r = $('#roll'); if (r) { const left = r.scrollLeft, atEnd = left + r.clientWidth >= r.scrollWidth - 30; r.outerHTML = roll(); const n = $('#roll'); if (n) n.scrollLeft = atEnd || C.rec ? n.scrollWidth : left; }
  const e = $('#cedit'), st = $('#cstate'), rec = document.querySelector('[data-a="crec"]'), p = document.querySelector('[data-a="cplay"]'), pd = document.querySelector('[data-a="cpedal"]');
  if (e) e.innerHTML = selTools(); if (st) st.innerHTML = statusLine();
  if (rec) rec.className = 'crec ' + (C.rec ? 'live' : '');
  if (p) p.innerHTML = `${C.playing ? '■' : '▶'}<small>${C.playing ? 'Stop' : 'Play'}</small>`;
  if (pd) { pd.className = 'cpedal ' + (P.isPedal() ? 'on' : ''); pd.textContent = P.isPedal() ? '🦶 Pedal ON' : '🦶 Sustain pedal'; }
}
function floatNote(m) {
  const k = document.querySelector(`#cpiano [data-cm="${m}"]`), pi = $('#cpiano'); if (!k || !pi) return;
  const r = k.getBoundingClientRect(), b = pi.getBoundingClientRect(), s = document.createElement('span');
  s.className = 'burst'; s.textContent = ['♪', '♫', '♩', '♬'][m % 4]; s.style.left = (r.left - b.left + r.width / 2) + 'px'; pi.appendChild(s); setTimeout(() => s.remove(), 700);
}
const keyEl = m => document.querySelector(`#cpiano [data-cm="${m}"]`);

/* ---------- the keyboard: press = sound, hold = longer, release = stop ---------- */
function down(pid, m) {
  P.audio();
  const voice = P.noteOn(m, .8), k = keyEl(m); if (k) k.classList.add('down'); floatNote(m);
  let ev = null;
  if (C && C.rec && !C.playing) {
    const now = performance.now();
    if (!sess) sess = { start: now - (C.notes.length ? end() + GAP : 0) }; // continuing: a short gap after what's there
    ev = { m, t: now - sess.start, d: 0 }; C.notes.push(ev); C.sel = -1;
    refresh(); loopLive();
  }
  held.set(pid, { m, voice, ev });
}
function up(pid) {
  const h = held.get(pid); if (!h) return; held.delete(pid);
  P.noteOff(h.voice);
  if (![...held.values()].some(x => x.m === h.m)) { const k = keyEl(h.m); if (k) k.classList.remove('down'); }
  if (h.ev) { if (P.isPedal()) h.ev.pend = true; else close(h.ev); }
}
function close(ev) { if (!sess) { ev.d = ev.d || 250; return; } ev.d = Math.max(MIN_D, Math.min(MAX_D, performance.now() - sess.start - ev.t)); delete ev.pend; refresh(); autosave(); }
function releaseAll() { for (const pid of [...held.keys()]) up(pid); if (C) C.notes.filter(n => n.pend || !n.d).forEach(close); }
function loopLive() { // a held note's bar grows while the key is down
  cancelAnimationFrame(raf);
  const tick = () => {
    if (!C || !sess) return;
    let any = false; const now = performance.now();
    C.notes.forEach((n, i) => { if (!n.d || n.pend) { any = true; const bar = document.querySelectorAll('#roll .rbar')[i]; if (bar) bar.style.width = Math.max(10, (now - sess.start - n.t) * PX - 2) + 'px'; } });
    if (any) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function setPedal(on) {
  P.pedal(on);
  if (!on && C) C.notes.filter(n => n.pend).forEach(close);
  refresh();
}

/* ---------- playback ---------- */
function light(m, ms) { const k = keyEl(m); if (!k) return; k.classList.add('on'); const id = setTimeout(() => k.classList.remove('on'), ms); timers.push(id); }
function play() {
  if (!C.notes.length) return;
  stopAll(); C.playing = true; refresh(); P.audio();
  const r = $('#roll'), ph = $('#phead'), total = end();
  if (ph) { ph.style.transition = 'none'; ph.style.left = '8px'; ph.style.opacity = 1; void ph.offsetWidth; ph.style.transition = `left ${total}ms linear`; ph.style.left = (8 + total * PX) + 'px'; }
  [...C.notes].map((n, i) => [n, i]).sort((a, b) => a[0].t - b[0].t).forEach(([n, i]) => {
    timers.push(setTimeout(() => { P.tone(n.m, n.d / 1000, .75); light(n.m, Math.max(120, n.d)); const bar = document.querySelectorAll('#roll .rbar')[i]; if (bar) { bar.classList.add('play'); if (r && bar.offsetLeft > r.scrollLeft + r.clientWidth - 40) r.scrollLeft = bar.offsetLeft - 40; setTimeout(() => bar.classList.remove('play'), Math.max(120, n.d)); } }, n.t));
  });
  timers.push(setTimeout(() => { C.playing = false; const p2 = $('#phead'); if (p2) p2.style.opacity = 0; refresh(); }, total + 300));
}
function metronome() {
  clearInterval(metroT); if (!C || !C.metro) return;
  const a = P.audio(), beat = 60000 / C.bpm; let i = 0;
  metroT = setInterval(() => { if (!a) return; const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.frequency.value = i++ % 4 ? 1500 : 2200; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0001, t + .04); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .05); }, beat);
}
function stopAll() { timers.forEach(clearTimeout); timers = []; P.allOff(); clearInterval(metroT); if (C) { C.playing = false; if (C.metro) metronome(); } document.querySelectorAll('#cpiano .on').forEach(k => k.classList.remove('on')); }
// Snap: start times and lengths to the nearest 16th note at the chosen tempo.
function snap() { const q = 60000 / C.bpm / 4; C.notes.forEach(n => { n.t = Math.round(n.t / q) * q; n.d = Math.max(q, Math.round(n.d / q) * q); }); refresh(); autosave(); }

/* ---------- buttons ---------- */
export async function click(a, b) {
  if (!C) open(null);
  switch (a) {
    case 'crec': C.rec = !C.rec; sess = null; if (C.rec) P.tone(96, .06, .3); refresh(); return true;
    case 'cplay': if (C.playing) { stopAll(); refresh(); } else { releaseAll(); sess = null; play(); } return true;
    case 'cundo': if (C.notes.length) { C.notes.pop(); C.sel = -1; refresh(); autosave(); } return true;
    case 'cpedal': setPedal(!P.isPedal()); return true;
    case 'cmetro': C.metro = !C.metro; b.classList.toggle('on', C.metro); metronome(); return true;
    case 'cbpm': C.bpm = Math.max(40, Math.min(200, C.bpm + +b.dataset.d)); $('#cbpmv').textContent = C.bpm; metronome(); autosave(); return true;
    case 'coct': releaseAll(); C.oct = Math.max(1, Math.min(6, C.oct + +b.dataset.d)); X.redraw(); return true;
    case 'csel': { const i = +b.dataset.i; C.sel = C.sel === i ? -1 : i; if (C.sel >= 0) { const n = C.notes[i]; P.tone(n.m, Math.min(1.5, n.d / 1000)); light(n.m, 300); } refresh(); return true; }
    case 'clen': { const n = C.notes[C.sel]; if (n) { n.d = Math.max(MIN_D, Math.min(MAX_D, n.d * +b.dataset.d)); P.tone(n.m, Math.min(2, n.d / 1000)); refresh(); autosave(); } return true; }
    case 'cdelnote': if (C.sel >= 0) { C.notes.splice(C.sel, 1); C.sel = -1; refresh(); autosave(); } return true;
    case 'csnap': snap(); return true;
    case 'cnew': releaseAll(); if (C.notes.length) save(true); open(null); X.redraw(); return true;
    case 'copen': releaseAll(); if (C.notes.length) save(true); open(b.dataset.id); X.redraw(); return true;
    case 'cdel': {
      const c = (X.doc().comp || {})[b.dataset.id]; if (!c) return true;
      if (!(await ask({ icon: '🗑️', title: `Delete “${esc(c.title)}”?`, text: 'This melody will be gone from all your devices.', ok: 'Delete', danger: true }))) return true;
      X.doc().comp[c.id] = { ...c, del: true, u: Date.now() }; X.quiet(); if (C.id === c.id) open(null); X.redraw(); return true;
    }
    default: return false;
  }
}

/* ---------- touch: several fingers at once, and sliding across keys plays each key ---------- */
const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest('#cpiano [data-cm]'); };
document.addEventListener('pointerdown', e => {
  const k = e.target.closest && e.target.closest('#cpiano [data-cm]'); if (!k) return;
  e.preventDefault(); try { k.releasePointerCapture && k.releasePointerCapture(e.pointerId); } catch (err) {}
  down(e.pointerId, +k.dataset.cm);
});
document.addEventListener('pointermove', e => {
  const h = held.get(e.pointerId); if (!h) return;
  const k = keyAt(e.clientX, e.clientY); if (!k) return;
  const m = +k.dataset.cm; if (m !== h.m) { up(e.pointerId); down(e.pointerId, m); }
});
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, e => up(e.pointerId)));
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
document.addEventListener('input', e => { if (e.target.id === 'ctitle' && C) { C.title = e.target.value; if (C.notes.length) autosave(); } });
export const _test = { state: () => C, down, up, save, events };
