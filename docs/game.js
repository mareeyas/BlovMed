// Maestro: a classical-music memory game. Listen, then play the notes back.
// Every round adds a note, so he ends up playing the whole piece. High score is saved to his account.
const NOTES = { C4: 60, 'C#4': 61, D4: 62, 'D#4': 63, E4: 64, F4: 65, 'F#4': 66, G4: 67, 'G#4': 68, A4: 69, 'A#4': 70, B4: 71, C5: 72, 'C#5': 73, D5: 74, 'D#5': 75, E5: 76 };
const WHITE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'];
const BLACK = [['C#4', 1], ['D#4', 2], ['F#4', 4], ['G#4', 5], ['A#4', 6], ['C#5', 8], ['D#5', 9]]; // [note, after white key #]
// Famous public-domain melodies (opening phrases), fitted to one keyboard.
const PIECES = [
  { by: 'Beethoven', title: 'Ode to Joy', n: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4' },
  { by: 'Vivaldi', title: 'Spring (The Four Seasons)', n: 'C4 E4 E4 E4 D4 C4 G4 G4 F4 E4 E4 E4 D4 C4 G4' },
  { by: 'Grieg', title: 'Morning Mood', n: 'G4 E4 D4 C4 D4 E4 G4 E4 D4 C4 D4 E4 D4 E4 G4 E4 G4 A4 E4 A4 G4 E4 D4 C4' },
  { by: 'Mozart', title: 'Eine kleine Nachtmusik', n: 'G4 D4 G4 D4 G4 D4 G4 B4 D5 C5 A4 C5 A4 C5 A4 F#4 A4 D4' },
  { by: 'Pachelbel', title: 'Canon in D', n: 'E5 D5 C5 B4 A4 G4 A4 B4 C5 B4 A4 G4 F4 E4 F4 D4' },
  { by: 'Mozart', title: 'Turkish March', n: 'B4 A4 G#4 A4 C5 D5 C5 B4 C5 E5 D5 C5 B4 A4 G#4 A4' },
  { by: 'Beethoven', title: 'Für Elise', n: 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 G#4 B4 C5' },
].map(p => ({ ...p, notes: p.n.split(' ') }));
const START_LEN = 3, LIVES = 3, PIECE_BONUS = 25;

let X = null;             // app context: { doc, quiet, act, carSVG, isShip, medLine, honk }
let S = null;             // the current game
let ac = null, muted = false, timers = [];
export const init = ctx => { X = ctx; };
export const playing = () => !!S && (S.phase === 'listen' || S.phase === 'input' || S.phase === 'wait');
export const best = () => ((X && X.doc().game) || {}).best || 0;

/* ---------- sound: a soft piano made from a few sine/triangle waves ---------- */
function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} return ac; }
function tone(name, dur = .45) {
  const a = audio(); if (!a || muted) return;
  const f = 440 * Math.pow(2, (NOTES[name] - 69) / 12), t = a.currentTime, g = a.createGain();
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.32, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(.7, dur * 2.2));
  [[1, 'triangle', 1], [2, 'sine', .3], [3, 'sine', .1], [4, 'sine', .05]].forEach(([h, ty, v]) => { const o = a.createOscillator(), og = a.createGain(); o.type = ty; o.frequency.value = f * h; og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + 2.4); });
  g.connect(a.destination);
}
function chord(names, at = 0) { setT(() => names.forEach(n => tone(n, .8)), at); }
const setT = (f, ms) => { const id = setTimeout(f, ms); timers.push(id); return id; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

/* ---------- screen ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function piano() {
  return `<div class="piano" id="piano">${WHITE.map((n, i) => `<button class="wk" data-n="${n}" aria-label="${n}"><span>${n[0]}</span></button>`).join('')}
    ${BLACK.map(([n, after]) => `<button class="bk" data-n="${n}" aria-label="${n}" style="left:calc(${after * 10}% - 3.2%)"></button>`).join('')}</div>`;
}
export function view() {
  const b = best(), g = (X.doc().game || {});
  const head = `<div class="gtop"><button class="back" data-a="gmback">← Back</button><span class="gbest">🏆 Best <b id="gbest">${b}</b></span><button class="mini-btn ghost" data-a="gmute">${muted ? '🔇' : '🔊'}</button></div>`;
  if (!S || S.phase === 'idle') return `${head}<div id="gamebox" class="gamebox">
     <div class="gintro"><div class="gicon2">🎹</div><h1>Maestro</h1><p class="sub">Listen to the notes, then play them back. Every round adds one more note, until you've played the whole piece. ${PIECES.length} famous melodies to master.</p></div>
     ${X.medLine()}
     <div class="gstats"><div><b>${b}</b><span>Best score</span></div><div><b>${g.plays || 0}</b><span>Games played</span></div><div><b>${g.pieces || 0}</b><span>Pieces mastered</span></div></div>
     <button class="btn full big" data-a="gstart">▶ Play</button>
     <details class="sec card" style="margin-top:12px"><summary><b>How to score</b></summary><div><ul>
      <li>+1 for every note you play right</li><li>+${PIECE_BONUS} bonus for finishing a whole piece</li><li>It gets faster as you go. You have ${LIVES} lives ❤️</li><li>Your ${X.isShip() ? 'ship' : 'car'} races ahead with every right note</li></ul></div></details></div>`;
  if (S.phase === 'over') {
    const rec = S.newBest;
    return `${head}<div id="gamebox" class="gamebox"><div class="gintro"><div class="gicon2">${rec ? '🏆' : '🎼'}</div><h1>${rec ? 'New record!' : 'Bravo!'}</h1>
      <div class="bigstat">${S.score}</div><p>${rec ? (S.prevBest ? `You beat your best of ${S.prevBest}!` : 'Your first high score. Now beat it!') : `Best: ${b} · ${b - S.score > 0 ? (b - S.score) + ' more to beat it' : 'so close!'}`}</p>
      <p class="mini">${S.done.length ? 'You played: ' + S.done.map(p => `<b>${esc(p.title)}</b> (${p.by})`).join(', ') : `You reached ${S.len - 1} notes of a piece by ${PIECES[S.pi % PIECES.length].by}.`}</p></div>
      ${X.medLine()}
      <button class="btn full big" data-a="gstart">▶ Play again</button></div>`;
  }
  const p = PIECES[S.pi % PIECES.length];
  return `${head}<div id="gamebox" class="gamebox playing">
    <div class="gbar"><span id="gscore">${S.score}</span><span id="glives">${'❤️'.repeat(S.lives)}${'🤍'.repeat(LIVES - S.lives)}</span></div>
    <div class="gpiece" id="gpiece">A piece by <b>${p.by}</b>${S.loop ? ` · round ${S.loop + 1}` : ''}</div>
    <div class="gtrack ${X.isShip() ? 'sea' : ''}"><div class="gcar" id="gcar">${X.carSVG()}</div><span class="gflag">${X.isShip() ? '🏝️' : '🏁'}</span></div>
    <div class="gmsg" id="gmsg">Listen…</div>${piano()}</div>`;
}

/* ---------- game flow ---------- */
function start() {
  audio(); clearTimers();
  const g = X.doc().game || {};
  S = { phase: 'wait', pi: 0, loop: 0, len: START_LEN, step: 0, score: 0, lives: LIVES, done: [], prevBest: g.best || 0, newBest: false, tempo: 520 };
  X.redraw(); setT(listen, 700);
}
function msg(t, cls) { const m = $('#gmsg'); if (m) { m.textContent = t; m.className = 'gmsg ' + (cls || ''); } }
function moveCar() {
  const c = $('#gcar'), p = PIECES[S.pi % PIECES.length]; if (!c) return;
  const prog = Math.min(1, (S.len - 1 + (S.phase === 'input' ? S.step : 0)) / p.notes.length);
  c.style.left = `calc(${prog * 100}% - ${prog * 70}px)`;
}
function light(n, ms) { const k = document.querySelector(`#piano [data-n="${n}"]`); if (!k) return; k.classList.add('on'); setT(() => k.classList.remove('on'), ms); }
function listen() {
  if (!S) return;
  const p = PIECES[S.pi % PIECES.length], seq = p.notes.slice(0, S.len);
  S.phase = 'listen'; S.step = 0; msg('Listen… 🎧'); moveCar();
  const gap = S.tempo;
  seq.forEach((n, i) => setT(() => { tone(n, gap / 1000); light(n, gap * .75); }, i * gap));
  setT(() => { if (!S) return; S.phase = 'input'; msg('Your turn 🎹', 'go'); }, seq.length * gap + 120);
}
function press(n) {
  if (!S) return;
  tone(n, .4); light(n, 220);
  if (S.phase !== 'input') return;
  const p = PIECES[S.pi % PIECES.length], want = p.notes[S.step];
  if (n !== want) { mistake(want); return; }
  S.step++; S.score++; upd(); moveCar();
  if (S.step < S.len) return;
  // round complete
  S.phase = 'wait';
  if (S.len >= p.notes.length) { // whole piece played
    S.score += PIECE_BONUS; S.done.push(p); upd(); vibrate([40, 40, 80]);
    msg(`🎉 You played “${p.title}”! +${PIECE_BONUS}`, 'win'); chord(['C4', 'E4', 'G4', 'C5'], 250);
    if (X.honk) setT(() => X.honk(), 200);
    setT(() => { if (!S) return; S.pi++; if (S.pi % PIECES.length === 0) S.loop++; S.len = START_LEN; S.tempo = Math.max(200, S.tempo * .92); X.redraw(); setT(listen, 600); }, 2200);
  } else {
    msg(['Nice!', 'Bravo!', 'Perfect!', 'Encore!', 'Magnifico!'][S.len % 5] + ' ✨', 'win'); vibrate(20);
    S.len++; S.tempo = Math.max(200, S.tempo * .97);
    setT(listen, 900);
  }
}
function mistake(want) {
  S.lives--; S.phase = 'wait'; upd(); vibrate([80, 60, 80]);
  const k = document.querySelector(`#piano [data-n="${want}"]`); if (k) { k.classList.add('hint'); setT(() => k.classList.remove('hint'), 900); }
  const box = $('#gamebox'); if (box) { box.classList.add('shake'); setT(() => box.classList.remove('shake'), 450); }
  if (S.lives <= 0) { msg('Out of lives 💔', 'bad'); setT(over, 1100); return; }
  msg(`Oops! Listen again (${S.lives} ${S.lives === 1 ? 'life' : 'lives'} left)`, 'bad');
  setT(listen, 1300);
}
function upd() { const s = $('#gscore'), l = $('#glives'); if (s) s.textContent = S.score; if (l) l.textContent = '❤️'.repeat(S.lives) + '🤍'.repeat(LIVES - S.lives); }
function over() {
  if (!S) return;
  const D = X.doc(), g = { ...(D.game || {}) }, t = Date.now();
  g.plays = (g.plays || 0) + 1; g.pieces = (g.pieces || 0) + S.done.length; g.last = S.score;
  if (S.score > (g.best || 0)) { g.best = S.score; g.bestAt = t; S.newBest = true; X.act('🏆', `New Maestro record: ${S.score} points`); chord(['C4', 'E4', 'G4'], 0); chord(['F4', 'A4', 'C5'], 350); chord(['G4', 'B4', 'D5'], 700); chord(['C5', 'E5', 'G4'], 1050); vibrate([60, 50, 60, 50, 140]); }
  else X.act('🎹', `Played Maestro: ${S.score} points`);
  g.u = t; D.game = g; X.quiet();
  S.phase = 'over'; X.redraw();
}
export function stop() { clearTimers(); S = null; }

/* ---------- input ---------- */
export function click(a) {
  if (a === 'gstart') { start(); return true; }
  if (a === 'gmute') { muted = !muted; const b = document.querySelector('[data-a="gmute"]'); if (b) b.textContent = muted ? '🔇' : '🔊'; return true; }
  return false;
}
// keys answer on touch-down for speed (not on click)
document.addEventListener('pointerdown', e => {
  const k = e.target.closest && e.target.closest('#piano [data-n]'); if (!k) return;
  e.preventDefault(); press(k.dataset.n);
});
export const _test = { PIECES, NOTES, state: () => S, press };
