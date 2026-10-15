(() => {
'use strict';
const L = window.MeguriLogic;

// ============================================================ setup
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1, S = 30, OX = 0, OY = 0, HAND_Y = 0;
const SQ3 = Math.sqrt(3);
const TAU = Math.PI * 2;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  // lay out for the size the canvas is actually shown at
  const r = canvas.getBoundingClientRect();
  VW = Math.round(r.width) || window.innerWidth;
  VH = Math.round(r.height) || window.innerHeight;
  canvas.width = Math.round(VW * DPR);
  canvas.height = Math.round(VH * DPR);
  const top = 64, bottom = 96;
  // board spans sqrt3*9 hex widths across and 14 hex sizes down
  S = Math.max(12, Math.min((VW - 24) / (SQ3 * 9), (VH - top - bottom) / 14));
  OX = VW / 2;
  OY = top + (VH - top - bottom) / 2;
  HAND_Y = Math.min(VH - 50, OY + S * 7 + 52);
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cx = i => OX + S * SQ3 * (L.CELLS[i].q + L.CELLS[i].r / 2);
const cy = i => OY + S * 1.5 * L.CELLS[i].r;

function cellAt(px, py) {
  const x = (px - OX) / S, y = (py - OY) / S;
  let q = (SQ3 / 3) * x - y / 3, r = (2 / 3) * y;
  let s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  const i = L.INDEX.get(rq + ',' + rr);
  return i === undefined ? -1 : i;
}

// ============================================================ audio
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null;
  function ensure() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      try { ac = new C(); } catch (e) { ac = null; return; }
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(f, dur, o = {}) {
    if (!ac) return;
    const t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.12, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  function noise(dur, o = {}) {
    if (!ac) return;
    const t = ac.currentTime + (o.delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = o.freq || 1000;
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  return {
    ensure,
    place(kind) { tone([0, 330, 392, 294][kind] || 260, 0.12, { type: 'triangle', vol: 0.09 }); noise(0.05, { vol: 0.05, freq: 2500 }); },
    burst(chain, delay) {
      const base = 262 * Math.pow(2, PENTA[Math.min(PENTA.length - 1, (chain - 1) * 2)] / 12);
      [0, 4, 7].forEach((st, i) => tone(base * Math.pow(2, st / 12), 0.5, { vol: 0.08, delay: delay + i * 0.04 }));
      noise(0.25, { vol: 0.08, freq: 3000, q: 0.7, delay });
    },
    turn(delay) { tone(520, 0.22, { vol: 0.05, to: 780, delay }); },
    rock(delay) { tone(90, 0.15, { type: 'square', vol: 0.04, to: 50, delay }); noise(0.1, { vol: 0.08, freq: 250, delay }); },
    crumble(delay) { noise(0.2, { vol: 0.1, freq: 500, delay }); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.6, { type: 'triangle', vol: 0.1, delay: i * 0.15 })); },
    tick() { tone(1200, 0.03, { vol: 0.03 }); },
  };
})();

// ============================================================ state
const COLORS = [null,
  { base: '#e8553a', dark: '#5a1d12', light: '#ffb199' },  // fire
  { base: '#3a8fe8', dark: '#12305a', light: '#9fd0ff' },  // water
  { base: '#5fbf4a', dark: '#1d4a16', light: '#c2f0a8' },  // plant
  { base: '#6b6560', dark: '#2e2a27', light: '#9a938c' },  // rock
];

let G = null;
let best = 0;
try { best = parseInt(localStorage.getItem('meguri.best') || '0', 10) || 0; } catch (e) { /* ignore */ }
let clock = 0;
let anim = null;        // the move being played out
let hover = -1, selected = -1, cursor = -1, usingKeys = false;
let shown = null;       // board as displayed (lags behind G.board while animating)
let popups = [], particles = [], newBest = false, overT = 0, titleT = 0;

function newGame() {
  const seed = (Math.random() * 4294967296) >>> 0;
  G = L.newGame(mulberry(seed));
  shown = G.board.slice();
  anim = null;
  popups = [];
  particles = [];
  newBest = false;
  hover = selected = -1;
}

function mulberry(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================ moves
const T_PLACE = 0.16, T_BURST = 0.42, T_TURN = 0.34, T_DROP = 0.28;

function busy() { return anim && clock < anim.end; }

function place(cell) {
  if (!G || G.over || busy() || cell < 0 || G.board[cell]) return;
  const before = G.board.slice();
  const out = L.play(G, cell, 0);
  if (!out) return;
  // lay the stages out on a timeline, with the board as it looks before each
  const steps = [];
  let t = clock;
  let b = before.slice();
  for (const st of out.res.stages) {
    const dur = st.type === 'place' ? T_PLACE : st.type === 'clear' ? T_BURST : T_TURN;
    steps.push({ st, t0: t, t1: t + dur, before: b.slice() });
    if (st.type === 'place') b[st.cell] = st.kind;
    else if (st.type === 'clear') { for (const c of st.cells) b[c.i] = 0; for (const i of st.rubble) b[i] = 0; }
    else for (const c of st.cells) b[c.i] = c.to;
    t += dur;
  }
  if (out.dropped.length) {
    steps.push({ st: { type: 'drop', cells: out.dropped }, t0: t, t1: t + T_DROP, before: b.slice() });
    for (const d of out.dropped) b[d.i] = d.k;
    t += T_DROP;
  }
  anim = { steps, end: t, after: b };
  // sounds and score pops, scheduled along the timeline
  Sfx.place(out.kind);
  for (const s of steps) {
    const d = s.t0 - clock;
    if (s.st.type === 'clear') {
      Sfx.burst(s.st.chain, d);
      if (s.st.rubble.length) Sfx.crumble(d + 0.1);
      let mx = 0, my = 0;
      for (const c of s.st.cells) { mx += cx(c.i); my += cy(c.i); }
      mx /= s.st.cells.length; my /= s.st.cells.length;
      popups.push({ x: mx, y: my, text: '+' + s.st.pts, chain: s.st.chain, t: s.t0 + 0.15 });
      for (const c of s.st.cells) burst(cx(c.i), cy(c.i), COLORS[c.k].light, s.t0, 6);
      for (const i of s.st.rubble) burst(cx(i), cy(i), COLORS[4].light, s.t0 + 0.05, 4);
    } else if (s.st.type === 'convert') Sfx.turn(d);
    else if (s.st.type === 'drop') Sfx.rock(d);
  }
  if (G.over) {
    overT = t + 0.4;
    if (G.score > best) { best = G.score; newBest = true; try { localStorage.setItem('meguri.best', String(best)); } catch (e) { /* ignore */ } }
    setTimeout(() => Sfx.over(), Math.max(0, (overT - clock) * 1000));
  }
  hover = selected = -1;
}

function burst(x, y, color, t, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = 40 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t, life: 0.4 + Math.random() * 0.3, color });
  }
}

// what the next stone would do right away: the groups that burst at once
function preview(cell) {
  if (cell < 0 || !G || G.board[cell]) return null;
  const b = G.board.slice();
  b[cell] = G.queue[0];
  const groups = L.bigGroups(b);
  const set = new Set();
  for (const g of groups) for (const i of g) set.add(i);
  return { cell, kind: G.queue[0], bursting: set };
}

// ============================================================ draw
function hexPath(x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function glyph(kind, x, y, r) {
  ctx.fillStyle = COLORS[kind].light;
  ctx.strokeStyle = COLORS[kind].light;
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  if (kind === 1) {
    // flame
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55);
    ctx.bezierCurveTo(x + r * 0.45, y - r * 0.1, x + r * 0.4, y + r * 0.45, x, y + r * 0.45);
    ctx.bezierCurveTo(x - r * 0.4, y + r * 0.45, x - r * 0.45, y + r * 0.05, x - r * 0.12, y - r * 0.2);
    ctx.quadraticCurveTo(x - r * 0.05, y + r * 0.05, x, y - r * 0.55);
    ctx.fill();
  } else if (kind === 2) {
    // drop
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55);
    ctx.bezierCurveTo(x + r * 0.1, y - r * 0.3, x + r * 0.42, y, x + r * 0.42, y + r * 0.15);
    ctx.arc(x, y + r * 0.15, r * 0.42, 0, Math.PI);
    ctx.bezierCurveTo(x - r * 0.42, y, x - r * 0.1, y - r * 0.3, x, y - r * 0.55);
    ctx.fill();
  } else if (kind === 3) {
    // leaf
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y + r * 0.42);
    ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.45, x + r * 0.45, y - r * 0.45);
    ctx.quadraticCurveTo(x + r * 0.45, y + r * 0.42, x - r * 0.45, y + r * 0.42);
    ctx.fill();
    ctx.strokeStyle = COLORS[3].dark;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.42, y + r * 0.38);
    ctx.lineTo(x + r * 0.25, y - r * 0.25);
    ctx.stroke();
  }
}

function stone(kind, x, y, r, a, sx) {
  if (!kind) return;
  ctx.save();
  ctx.globalAlpha = a == null ? 1 : a;
  ctx.translate(x, y);
  if (sx != null) ctx.scale(sx, 1);
  const c = COLORS[kind];
  if (kind === 4) {
    ctx.fillStyle = c.base;
    ctx.beginPath();
    const pts = [[-0.7, -0.3], [-0.25, -0.72], [0.45, -0.6], [0.75, -0.05], [0.4, 0.62], [-0.3, 0.7], [-0.75, 0.25]];
    pts.forEach(([px, py], k) => (k ? ctx.lineTo(px * r, py * r) : ctx.moveTo(px * r, py * r)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.moveTo(-0.2 * r, -0.1 * r); ctx.lineTo(0.25 * r, 0.05 * r); ctx.lineTo(0.05 * r, 0.3 * r);
    ctx.closePath();
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, c.light);
    g.addColorStop(0.35, c.base);
    g.addColorStop(1, c.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    glyph(kind, 0, r * 0.02, r * 0.95);
  }
  ctx.restore();
}

// the four-in-a-row groups: one more of that kind and they burst
function nearGroups(b) {
  const out = new Set();
  const seen = new Uint8Array(L.N);
  for (let i = 0; i < L.N; i++) {
    if (!b[i] || b[i] === L.ROCK || seen[i]) continue;
    const g = L.group(b, i);
    for (const j of g) seen[j] = 1;
    if (g.length === L.CFG.clear - 1) for (const j of g) out.add(j);
  }
  return out;
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#14110f';
  ctx.fillRect(0, 0, VW, VH);
  if (!G) return;

  // which board to show, and what is happening to it right now
  let step = null, k = 1, b = G.board;
  if (anim) {
    if (clock < anim.end) {
      step = anim.steps.find(s => clock < s.t1) || null;
      if (step) { b = step.before; k = clamp((clock - step.t0) / (step.t1 - step.t0), 0, 1); }
    } else b = anim.after;
  }

  // board cells
  const r = S * 0.98;
  for (let i = 0; i < L.N; i++) {
    hexPath(cx(i), cy(i), r);
    ctx.fillStyle = (L.CELLS[i].q - L.CELLS[i].r) % 3 === 0 ? '#2a2420' : '#241f1b';
    ctx.fill();
  }

  // stones coming in after the next move
  if (!busy() && !G.over) {
    for (const d of G.drops) {
      hexPath(cx(d.i), cy(d.i), r * 0.78);
      ctx.strokeStyle = '#8a827a';
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(clock * 4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  const pv = !busy() && !G.over ? preview(selected >= 0 ? selected : hover >= 0 ? hover : usingKeys ? cursor : -1) : null;
  const near = !step ? nearGroups(b) : new Set();
  const stoneR = S * 0.74;

  for (let i = 0; i < L.N; i++) {
    const kind = b[i];
    if (!kind) continue;
    let x = cx(i), y = cy(i);
    if (step && step.st.type === 'clear') {
      const c = step.st.cells.find(c => c.i === i);
      if (c) {
        // swell, then pop
        const s = k < 0.35 ? 1 + k * 0.6 : Math.max(0, 1.2 - (k - 0.35) * 2.2);
        ctx.globalAlpha = 1;
        if (s > 0) stone(kind, x, y, stoneR * s, 1);
        continue;
      }
      if (step.st.rubble.includes(i)) {
        if (k < 0.5) stone(kind, x + (Math.random() - 0.5) * 3, y, stoneR, 1 - k);
        continue;
      }
    }
    if (step && step.st.type === 'convert') {
      const c = step.st.cells.find(c => c.i === i);
      if (c) {
        // flip over to the winner's side
        const sx = Math.abs(Math.cos(k * Math.PI));
        stone(k < 0.5 ? c.from : c.to, x, y, stoneR, 1, Math.max(0.05, sx));
        continue;
      }
    }
    if (near.has(i)) {
      ctx.strokeStyle = COLORS[kind].light;
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(clock * 5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, stoneR + 3, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    stone(kind, x, y, stoneR, 1);
    if (pv && pv.bursting.has(i)) {
      ctx.strokeStyle = '#fff6e0';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(clock * 10);
      ctx.beginPath();
      ctx.arc(x, y, stoneR + 4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // placing / falling in
  if (step && step.st.type === 'place') {
    const s = 1.4 - 0.4 * k;
    stone(step.st.kind, cx(step.st.cell), cy(step.st.cell), stoneR * s, 0.4 + 0.6 * k);
  }
  if (step && step.st.type === 'drop') {
    for (const d of step.st.cells) stone(d.k, cx(d.i), cy(d.i) - (1 - k) * S * 1.2, stoneR, k);
  }
  // the stone about to be placed
  if (pv) {
    stone(pv.kind, cx(pv.cell), cy(pv.cell), stoneR, 0.55);
    if (pv.bursting.has(pv.cell)) {
      ctx.strokeStyle = '#fff6e0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx(pv.cell), cy(pv.cell), stoneR + 4, 0, TAU);
      ctx.stroke();
    }
  }
  if (usingKeys && cursor >= 0 && !busy() && !G.over) {
    hexPath(cx(cursor), cy(cursor), r * 0.95);
    ctx.strokeStyle = '#fff6e0';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // particles
  for (const p of particles) {
    const t = clock - p.t;
    if (t < 0 || t > p.life) continue;
    ctx.globalAlpha = 1 - t / p.life;
    ctx.fillStyle = p.color;
    const e = 1 - Math.exp(-t * 5);
    ctx.fillRect(p.x + p.vx * e * 0.4 - 2, p.y + p.vy * e * 0.4 - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // score pops
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    const t = clock - p.t;
    if (t < 0 || t > 1.2) continue;
    ctx.globalAlpha = Math.max(0, 1 - t / 1.2);
    const big = p.chain >= 2;
    ctx.fillStyle = big ? '#ffd76a' : '#fff6e0';
    ctx.font = `700 ${Math.round(S * (big ? 0.85 : 0.6))}px ui-rounded, "Hiragino Maru Gothic ProN", system-ui, sans-serif`;
    ctx.fillText(p.text, p.x, p.y - t * S * 1.2);
    if (big) {
      ctx.font = `800 ${Math.round(S * 0.6)}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText('×' + p.chain * p.chain, p.x, p.y - t * S * 1.2 - S * 0.8);
    }
  }
  ctx.globalAlpha = 1;

  drawHud();

  if (clock - titleT < 3.2) {
    const t = clock - titleT;
    ctx.globalAlpha = t < 2 ? 0.9 : 0.9 * (1 - (t - 2) / 1.2);
    ctx.fillStyle = '#fff6e0';
    ctx.font = `300 ${Math.round(Math.min(VW, VH) * 0.11)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    ctx.fillText('めぐり', VW / 2, OY - S * 4.2);
    ctx.globalAlpha = 1;
  }

  if (G.over && clock >= overT) {
    const a = Math.min(1, (clock - overT) / 0.5);
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = '#14110f';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a;
    const big = Math.round(Math.min(VW, VH) * 0.13);
    ctx.fillStyle = newBest ? '#ffd76a' : '#fff6e0';
    ctx.font = `300 ${big}px ui-rounded, system-ui, sans-serif`;
    ctx.fillText(String(G.score), VW / 2, VH * 0.42);
    ctx.fillStyle = '#a89c90';
    ctx.font = `500 ${Math.round(big * 0.22)}px ui-rounded, system-ui, sans-serif`;
    ctx.fillText('BEST ' + best, VW / 2, VH * 0.42 + big * 0.85);
    ctx.globalAlpha = 1;
  }
}

function drawHud() {
  const y = 22;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff6e0';
  ctx.font = `700 ${Math.round(clamp(S * 0.8, 18, 30))}px ui-rounded, system-ui, sans-serif`;
  const shownScore = busy() ? G.score - pendingPoints() : G.score;
  ctx.fillText(String(shownScore), 18, y - 6);
  if (best > 0) {
    ctx.fillStyle = shownScore > best ? '#ffd76a' : '#6f655c';
    ctx.font = `500 ${Math.round(clamp(S * 0.38, 10, 14))}px ui-rounded, system-ui, sans-serif`;
    ctx.fillText('BEST ' + Math.max(best, shownScore), 18, y + clamp(S * 0.8, 18, 30));
  }
  // the hand: what goes down next, and after that
  const q = G.queue;
  const hx = VW / 2;
  const rr = clamp(S * 0.85, 16, 34);
  stone(q[0], hx, HAND_Y, rr, G.over ? 0.3 : 1);
  ctx.strokeStyle = '#fff6e0';
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, HAND_Y, rr + 6, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  stone(q[1], hx + rr * 2.4, HAND_Y + rr * 0.3, rr * 0.62, 0.75);
  stone(q[2], hx + rr * 3.7, HAND_Y + rr * 0.45, rr * 0.48, 0.5);
}

function pendingPoints() {
  let p = 0;
  for (const s of anim.steps) if (s.st.type === 'clear' && s.t0 + 0.15 > clock) p += s.st.pts;
  return p;
}

// ============================================================ input
function local(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (VW / (r.width || VW)), (e.clientY - r.top) * (VH / (r.height || VH))];
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  usingKeys = false;
  hover = cellAt(...local(e));
});
canvas.addEventListener('pointerleave', () => { hover = -1; });
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  canvas.focus();
  Sfx.ensure();
  if (G.over) { if (clock > overT + 0.6) newGame(); return; }
  if (busy()) return;
  usingKeys = false;
  const c = cellAt(...local(e));
  if (e.pointerType === 'mouse') { place(c); return; }
  // touch: first tap shows, second tap places
  if (c < 0 || G.board[c]) { selected = -1; return; }
  if (selected === c) place(c);
  else { selected = c; Sfx.tick(); }
});

const KEYDIR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
window.addEventListener('keydown', e => {
  if (KEYDIR[e.code] || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
  Sfx.ensure();
  if (G.over) { if (!e.repeat && clock > overT + 0.6) newGame(); return; }
  if (KEYDIR[e.code]) {
    if (!usingKeys || cursor < 0) { usingKeys = true; hover = -1; selected = -1; cursor = cursor < 0 ? L.INDEX.get('0,0') : cursor; return; }
    // move to the neighbour that lies most in that direction on screen
    const [dx, dy] = KEYDIR[e.code];
    let bestN = cursor, bestV = 0.3;
    for (const n of L.NBR[cursor]) {
      const vx = cx(n) - cx(cursor), vy = cy(n) - cy(cursor);
      const v = (vx * dx + vy * dy) / Math.hypot(vx, vy);
      if (v > bestV) { bestV = v; bestN = n; }
    }
    cursor = bestN;
  } else if ((e.code === 'Space' || e.code === 'Enter') && usingKeys && cursor >= 0 && !e.repeat) {
    place(cursor);
  }
});

// ============================================================ loop
function frame(t) {
  clock = t / 1000;
  const r = canvas.getBoundingClientRect();
  if (Math.abs(r.width - VW) > 1 || Math.abs(r.height - VH) > 1) resize();
  if (anim && clock >= anim.end) anim = null;
  particles = particles.filter(p => clock < p.t + p.life);
  popups = popups.filter(p => clock < p.t + 1.3);
  draw();
  requestAnimationFrame(frame);
}
clock = performance.now() / 1000;
titleT = clock;
newGame();
requestAnimationFrame(frame);

// hooks for automated checks
window.__meguri = { get G() { return G; }, place, newGame, busy, L, setSeed: s => { G = L.newGame(mulberry(s)); shown = G.board.slice(); anim = null; } };
})();
