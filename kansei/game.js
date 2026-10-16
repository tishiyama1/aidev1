(() => {
'use strict';

// ============================================================ setup
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const N = 11;
let VW = 0, VH = 0, DPR = 1, CELL = 40, OX = 0, OY = 0;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  // lay out for the size the canvas is actually shown at, so drawing and taps
  // agree however the browser sizes the viewport (mobile toolbars, 100vh quirks)
  const r = canvas.getBoundingClientRect();
  VW = Math.round(r.width) || window.innerWidth;
  VH = Math.round(r.height) || window.innerHeight;
  canvas.width = Math.round(VW * DPR);
  canvas.height = Math.round(VH * DPR);
  const top = 58, bottom = 34;
  CELL = Math.max(18, Math.floor(Math.min((VW - 20) / N, (VH - top - bottom) / N)));
  OX = Math.floor((VW - CELL * N) / 2);
  OY = Math.floor(top + (VH - top - bottom - CELL * N) / 2);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// seedable rng
let seed = (Math.random() * 4294967296) >>> 0;
function rnd() {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
function pick(a) { return a[Math.floor(rnd() * a.length)]; }

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
    const v = o.vol == null ? 0.15 : o.vol;
    if (v < 0.001) return;
    const t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  // a rushing sound whose pitch rises, like a jet passing
  function sweep(dur, o = {}) {
    if (!ac) return;
    const t = ac.currentTime + (o.delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(o.from || 400, t);
    f.frequency.exponentialRampToValueAtTime(o.to || 1800, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.08, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
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
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
  return {
    ensure,
    move(speed, delay) { sweep(0.3 + speed * 0.04, { vol: 0.07 + speed * 0.012, from: 400, to: 1900, delay }); },
    // a burst of cannon fire
    gun(delay, dur) { const n = Math.max(3, Math.floor(dur / 0.04)); for (let i = 0; i < n; i++) noise(0.03, { vol: 0.07, freq: 1500 + (i % 2) * 500, q: 1.4, delay: delay + i * 0.04 }); },
    // a downed plane's falling whistle
    fall(delay, dur) { tone(1500, dur, { type: 'sawtooth', vol: 0.025, to: 140, delay }); sweep(dur, { vol: 0.06, from: 1800, to: 260, delay }); },
    // the rush of a plane pulling up into a loop
    sweepUp(delay, dur) { sweep(dur, { vol: 0.09, from: 260, to: 1500, delay }); },
    boom(delay, vol) { noise(0.35, { vol: vol || 0.12, freq: 180, q: 0.6, delay }); tone(90, 0.3, { type: 'sine', vol: (vol || 0.12) * 0.9, to: 38, delay }); },
    kill(k, delay) {
      const f = 330 * Math.pow(2, SCALE[Math.min(k, SCALE.length - 1)] / 12);
      // the cannon rounds land: a crack, and a clear note that climbs with each kill
      noise(0.14, { vol: 0.12, freq: 2600, q: 0.8, delay });
      tone(f, 0.3, { type: 'triangle', vol: 0.1, delay: delay + 0.02 });
      tone(f * 2, 0.14, { vol: 0.04, delay: delay + 0.02 });
    },
    bounce(delay) { tone(620, 0.16, { vol: 0.1, to: 940, delay }); },
    crash(delay) { tone(110, 0.18, { type: 'square', vol: 0.06, to: 60, delay }); noise(0.12, { vol: 0.12, freq: 300, delay }); },
    hurt(delay) { tone(180, 0.4, { type: 'sawtooth', vol: 0.14, to: 60, delay }); noise(0.3, { vol: 0.18, freq: 600, delay }); },
    fire(delay) { noise(0.2, { vol: 0.09, freq: 1800, q: 2, delay }); },
    spawn(delay) { tone(240, 0.25, { vol: 0.04, to: 480, delay }); },
    clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, { vol: 0.1, delay: i * 0.07 })); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.12, delay: i * 0.14 })); },
    select() { tone(880, 0.05, { vol: 0.04 }); },
  };
})();

// ============================================================ state
const G = {
  grid: new Uint8Array(N * N), edgeBounce: false,
  player: null, enemies: [], spawns: [],
  score: 0, streak: 0, floor: 1, quota: 0, killed: 0, turn: 0, nextId: 1,
  best: 0, newBest: false, over: false, overT: 0, pendingClear: false,
  options: [], markers: [], hover: null, selected: null,
  // animation
  clock: 0, tl: null, path: null, oldMarks: [], deadAt: new Map(), corpses: [],
  flashes: [], popups: [], particles: [], rings: [], lastPath: null, guns: [], maneuvers: [], shake: 0, hurtT: -9, transT: -9, titleT: 0, bumpT: new Map(),
};
try { G.best = parseInt(localStorage.getItem('kansei.best') || '0', 10) || 0; } catch (e) { /* ignore */ }

const inB = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
function cellType(x, y) {
  if (!inB(x, y)) return G.edgeBounce ? 2 : 1;
  return G.grid[y * N + x];
}
const blocked = (x, y) => cellType(x, y) !== 0;
function enemyAt(x, y, skip) {
  for (const e of G.enemies) if (e.x === x && e.y === y && !(skip && skip.has(e))) return e;
  return null;
}
function spawnAt(x, y) { return G.spawns.find(s => s.x === x && s.y === y) || null; }

// ============================================================ arena
function genArena(floor) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const g = new Uint8Array(N * N);
    const quad = rnd() < 0.6;
    const put = (x, y, v) => {
      if (!inB(x, y)) return;
      const pts = quad ? [[x, y], [N - 1 - x, y], [x, N - 1 - y], [N - 1 - x, N - 1 - y]] : [[x, y], [N - 1 - x, N - 1 - y]];
      for (const [px, py] of pts) g[py * N + px] = v;
    };
    const area = quad ? [5, 5] : [10, 5];
    const nWall = ri(1, 3) + (floor >= 4 ? 1 : 0);
    const shapes = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 1]]];
    for (let i = 0; i < nWall; i++) {
      const x = ri(0, area[0]), y = ri(0, area[1]);
      for (const [dx, dy] of pick(shapes)) put(x + dx, y + dy, 1);
    }
    const nBump = ri(0, 1) + Math.min(3, Math.floor(floor / 2));
    for (let i = 0; i < nBump; i++) put(ri(0, area[0]), ri(0, area[1]), 2);
    for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) g[y * N + x] = 0;
    let blockedCount = 0;
    for (let i = 0; i < N * N; i++) if (g[i]) blockedCount++;
    if (blockedCount > N * N * 0.2) continue;
    // all open cells connected (4-way)
    const seen = new Uint8Array(N * N);
    const q = [5 * N + 5];
    seen[q[0]] = 1;
    let open = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      open++;
      const cx = c % N, cy = (c / N) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(nx, ny)) continue;
        const k = ny * N + nx;
        if (!g[k] && !seen[k]) { seen[k] = 1; q.push(k); }
      }
    }
    if (open !== N * N - blockedCount) continue;
    return g;
  }
  return new Uint8Array(N * N);
}

// ============================================================ movement
// The player's whole move for an acceleration (ax, ay): walls stop you,
// bright blocks bounce you, enemies on the way are destroyed.
function simulate(ax, ay) {
  const P = G.player;
  let vx = P.vx + ax, vy = P.vy + ay;
  let x = P.x, y = P.y;
  const n = Math.max(Math.abs(vx), Math.abs(vy));
  const path = [{ x, y }];
  const kills = [];
  const bounces = [];
  const killSet = new Set();
  let crash = null, clank = null;
  let accX = Math.floor(n / 2), accY = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    accX += Math.abs(vx);
    accY += Math.abs(vy);
    let dx = 0, dy = 0;
    if (accX >= n) { accX -= n; dx = sign(vx); }
    if (accY >= n) { accY -= n; dy = sign(vy); }
    if (!dx && !dy) continue;
    let nx = x + dx, ny = y + dy;
    const bx = dx !== 0 && blocked(x + dx, y);
    const by = dy !== 0 && blocked(x, y + dy);
    const hit = blocked(nx, ny) || (dx && dy && bx && by);
    if (hit) {
      let flipX, flipY;
      if (dx && dy) {
        flipX = bx; flipY = by;
        if (!bx && !by) { flipX = true; flipY = true; }
      } else { flipX = !!dx; flipY = !!dy; }
      // what did we hit along the flipped axes?
      const hitCells = [];
      if (flipX) hitCells.push(bx ? [x + dx, y] : [nx, ny]);
      if (flipY) hitCells.push(by ? [x, y + dy] : [nx, ny]);
      const wall = hitCells.some(([hx, hy]) => cellType(hx, hy) === 1);
      if (wall) {
        crash = { x: x + (flipX ? dx : 0) * 0.5, y: y + (flipY ? dy : 0) * 0.5 };
        vx = 0; vy = 0;
        break;
      }
      if (flipX) vx = -vx;
      if (flipY) vy = -vy;
      bounces.push({ x: x + (flipX ? dx : 0) * 0.5, y: y + (flipY ? dy : 0) * 0.5, cx: flipX ? x + dx : x, cy: flipY ? y + dy : y, cell: flipX && flipY ? [nx, ny] : flipX ? [x + dx, y] : [x, y + dy] });
      dx = flipX ? 0 : dx;
      dy = flipY ? 0 : dy;
      if (!dx && !dy) { path.push({ x, y, bounce: true }); continue; }
      nx = x + dx; ny = y + dy;
      if (blocked(nx, ny)) { path.push({ x, y, bounce: true }); continue; }
    }
    const e = enemyAt(nx, ny, killSet);
    if (e) {
      if (e.type === 'shell' && n < e.armor) {
        clank = { x: x + dx * 0.5, y: y + dy * 0.5, e };
        vx = 0; vy = 0;
        break;
      }
      killSet.add(e);
      kills.push({ e, step: path.length });
    }
    x = nx; y = ny;
    path.push({ x, y });
  }
  const stomp = spawnAt(x, y);
  return { ax, ay, ex: x, ey: y, vx, vy, speed: n, path, kills, killSet, bounces, crash, clank, stomp };
}

// is there at least one move that lands outside every marked cell?
function anySafe() {
  for (let ay = -1; ay <= 1; ay++) {
    for (let ax = -1; ax <= 1; ax++) {
      const o = simulate(ax, ay);
      if (!threatCells(o.killSet).has(o.ey * N + o.ex)) return true;
    }
  }
  return false;
}

// Keep a way out. Mortars never close off every move; and right after a hit,
// no enemy may, so hits can't follow one another unavoidably. Enemies that
// would close it off hold their fire this turn (mortars first).
function ensureEscape(justHit) {
  if (anySafe()) return;
  for (const t of justHit ? ['mortar', 'lancer', 'shell', 'spike'] : ['mortar']) {
    for (const e of G.enemies) {
      if (e.type !== t || !e.marks.length) continue;
      e.marks = [];
      e.aim = null;
      if (anySafe()) return;
    }
  }
}

function threatCells(killSet) {
  const s = new Set();
  for (const e of G.enemies) {
    if (killSet && killSet.has(e)) continue;
    for (const [x, y] of e.marks) s.add(y * N + x);
  }
  return s;
}

function computeOptions() {
  G.options = [];
  G.markers = [];
  G.hover = null;
  G.selected = null;
  if (G.over || !G.player) return;
  const groups = new Map();
  for (let ay = -1; ay <= 1; ay++) {
    for (let ax = -1; ax <= 1; ax++) {
      const o = simulate(ax, ay);
      o.danger = threatCells(o.killSet).has(o.ey * N + o.ex);
      G.options.push(o);
      const k = o.ey * N + o.ex;
      const cur = groups.get(k);
      const better = !cur
        || o.kills.length > cur.kills.length
        || (o.kills.length === cur.kills.length && Math.max(Math.abs(o.vx), Math.abs(o.vy)) > Math.max(Math.abs(cur.vx), Math.abs(cur.vy)));
      if (better) groups.set(k, o);
    }
  }
  G.markers = [...groups.values()];
}

// ============================================================ enemies
const TYPES = {
  spike: { color: '#ff3d5a' },
  shell: { color: '#ff3d5a' },
  lancer: { color: '#ff9a3c' },
  mortar: { color: '#d45cff' },
};

function makeEnemy(type, x, y) {
  return {
    id: G.nextId++, type, x, y, fx: x, fy: y, mt0: 0, mt1: 0, bornT: -9,
    marks: [], aim: null, cd: 0, slow: 0,
    armor: type === 'shell' ? (G.floor >= 7 && rnd() < 0.5 ? 3 : 2) : 0,
  };
}

function pickType() {
  const f = G.floor;
  const w = [['spike', 3]];
  if (f >= 2) w.push(['lancer', 2]);
  if (f >= 3) w.push(['shell', 1.6]);
  if (f >= 5) w.push(['mortar', 1.4]);
  let tot = 0;
  for (const [, v] of w) tot += v;
  let r = rnd() * tot;
  for (const [t, v] of w) { if ((r -= v) < 0) return t; }
  return 'spike';
}

function distMap() {
  const P = G.player;
  const d = new Int16Array(N * N).fill(-1);
  const q = [P.y * N + P.x];
  d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % N, cy = (c / N) | 0;
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (blocked(nx, ny)) continue;
      if (dx && dy && blocked(cx + dx, cy) && blocked(cx, cy + dy)) continue;
      const k = ny * N + nx;
      if (d[k] < 0) { d[k] = d[c] + 1; q.push(k); }
    }
  }
  return d;
}

function freeCell(x, y) {
  if (blocked(x, y)) return false;
  if (G.player.x === x && G.player.y === y) return false;
  if (enemyAt(x, y)) return false;
  return true;
}

function legalStep(e, dx, dy) {
  const nx = e.x + dx, ny = e.y + dy;
  if (!freeCell(nx, ny)) return false;
  if (dx && dy && blocked(e.x + dx, e.y) && blocked(e.x, e.y + dy)) return false;
  return true;
}

// a clear straight line (rook or bishop) from (ex, ey) to the player;
// walls and other enemies block it
function alignedDir(ex, ey, self) {
  const P = G.player;
  const dx = P.x - ex, dy = P.y - ey;
  if (!dx && !dy) return null;
  if (dx && dy && Math.abs(dx) !== Math.abs(dy)) return null;
  const sx = sign(dx), sy = sign(dy);
  let x = ex + sx, y = ey + sy;
  while (x !== P.x || y !== P.y) {
    if (blocked(x, y)) return null;
    const o = enemyAt(x, y);
    if (o && o !== self) return null;
    x += sx; y += sy;
  }
  return [sx, sy];
}

function stepToward(e, d) {
  const cur = d[e.y * N + e.x];
  const opts = [];
  for (const [dx, dy] of DIRS8) {
    if (!legalStep(e, dx, dy)) continue;
    const v = d[(e.y + dy) * N + e.x + dx];
    if (v >= 0 && (cur < 0 || v < cur)) opts.push([dx, dy, v]);
  }
  if (!opts.length) return;
  opts.sort((a, b) => a[2] - b[2]);
  const bestV = opts[0][2];
  const [dx, dy] = pick(opts.filter(o => o[2] === bestV));
  e.x += dx; e.y += dy;
}

// close in on a spot from which its own pattern covers the player
function stepToStrike(e, d, covers) {
  const P = G.player;
  let best = [], bv = 1e9;
  const cand = [[0, 0]].concat(DIRS8.filter(([dx, dy]) => legalStep(e, dx, dy)));
  for (const [dx, dy] of cand) {
    const x = e.x + dx, y = e.y + dy;
    let v = covers(P.x - x, P.y - y) ? -1 : d[y * N + x];
    if (v < 0 && !covers(P.x - x, P.y - y)) v = 999;
    if (v < bv) { bv = v; best = [[dx, dy]]; } else if (v === bv) best.push([dx, dy]);
  }
  const [dx, dy] = pick(best);
  e.x += dx; e.y += dy;
}
// up close, either one turns its pattern toward you
const ADJ = (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy)) === 1;

function moveEnemy(e, d) {
  const P = G.player;
  if (e.type === 'spike') {
    stepToStrike(e, d, ADJ);
  } else if (e.type === 'shell') {
    e.slow ^= 1;
    if (e.slow) stepToStrike(e, d, ADJ);
  } else if (e.type === 'lancer') {
    if (alignedDir(e.x, e.y, e)) return;
    const opts = [];
    for (const [dx, dy] of DIRS8) {
      if (!legalStep(e, dx, dy)) continue;
      if (alignedDir(e.x + dx, e.y + dy, e) && cheb(e.x + dx, e.y + dy, P.x, P.y) >= 2) opts.push([dx, dy]);
    }
    if (opts.length) {
      const [dx, dy] = pick(opts);
      e.x += dx; e.y += dy;
    } else {
      stepToward(e, d);
    }
  } else if (e.type === 'mortar') {
    e.slow ^= 1;
    if (e.slow && cheb(e.x, e.y, P.x, P.y) > 3) stepToward(e, d);
  }
}

function computeMarks(e) {
  e.marks = [];
  e.aim = null;
  if (e.cd > 0) { e.cd--; return; }
  const P = G.player;
  if (e.type === 'spike' || e.type === 'shell') {
    // spike: diagonals, shell: sides; turned toward a player right beside it
    const rx = P.x - e.x, ry = P.y - e.y;
    let diag = e.type === 'spike';
    if (ADJ(rx, ry)) diag = rx !== 0 && ry !== 0;
    for (const [dx, dy] of DIRS8) {
      if ((dx !== 0 && dy !== 0) !== diag) continue;
      if (!blocked(e.x + dx, e.y + dy)) e.marks.push([e.x + dx, e.y + dy]);
    }
  } else if (e.type === 'lancer') {
    const dir = alignedDir(e.x, e.y, e);
    if (!dir) return;
    e.aim = dir;
    let x = e.x + dir[0], y = e.y + dir[1];
    while (!blocked(x, y) && !enemyAt(x, y)) { e.marks.push([x, y]); x += dir[0]; y += dir[1]; }
  } else if (e.type === 'mortar') {
    if (cheb(e.x, e.y, P.x, P.y) > 6) return;
    // it shells where your momentum is taking you
    const tx = clamp(P.x + P.vx, 0, N - 1), ty = clamp(P.y + P.vy, 0, N - 1);
    e.aim = [tx, ty];
    for (const [dx, dy] of [[0, 0]].concat(DIRS4)) if (!blocked(tx + dx, ty + dy)) e.marks.push([tx + dx, ty + dy]);
  }
}

function placeSpawn(minDist) {
  const P = G.player;
  const cells = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!freeCell(x, y) || spawnAt(x, y)) continue;
      if (cheb(x, y, P.x, P.y) < minDist) continue;
      cells.push([x, y]);
    }
  }
  return cells.length ? pick(cells) : null;
}

// ============================================================ floors
function startFloor() {
  G.grid = genArena(G.floor);
  G.arenaId = (G.arenaId || 0) + 1;
  G.edgeBounce = G.floor >= 6 && rnd() < 0.35;
  const P = G.player;
  P.x = 5; P.y = 5; P.vx = 0; P.vy = 0;
  G.enemies = [];
  G.spawns = [];
  G.quota = 5 + G.floor;
  G.killed = 0;
  G.cap = Math.min(8, 2 + G.floor);
  const init = Math.min(G.cap, 1 + G.floor);
  for (let i = 0; i < init; i++) {
    const c = placeSpawn(4);
    if (!c) break;
    const e = makeEnemy(i === 0 ? 'spike' : pickType(), c[0], c[1]);
    e.bornT = G.clock;
    G.enemies.push(e);
  }
  for (const e of G.enemies) computeMarks(e);
  ensureEscape(true);
  G.pendingClear = false;
  G.floorHurt = false;
  computeOptions();
}

function newRun() {
  G.player = { x: 5, y: 5, vx: 0, vy: 0, hp: 3 };
  G.score = 0;
  G.streak = 0;
  G.floor = 1;
  G.turn = 0;
  G.over = false;
  G.newBest = false;
  G.tl = null;
  G.path = null;
  G.corpses = [];
  G.popups = [];
  G.particles = [];
  G.flashes = [];
  G.rings = [];
  G.lastPath = null;
  G.guns = [];
  G.maneuvers = [];
  G.oldMarks = [];
  startFloor();
  G.transT = G.clock;
}

function nextFloor() {
  G.floor++;
  // a clean floor mends one heart
  if (!G.floorHurt) G.player.hp = Math.min(3, G.player.hp + 1);
  G.corpses = [];
  startFloor();
  G.transT = G.clock;
}

function addScore(pts, x, y, t, big) {
  G.score += pts;
  G.popups.push({ x, y, text: '+' + pts, t, big: !!big });
}

function floorDone() {
  return G.killed >= G.quota && G.enemies.length === 0 && G.spawns.length === 0;
}

// ============================================================ turn
// How fast the flight plays: three settings, saved between visits. 1 is slow, 3 is quick.
const SPEEDS = [2.5, 1.7, 1.0];
let speedIdx = 1;
try { const v = parseInt(localStorage.getItem('kansei.speed') || '1', 10); if (v >= 0 && v <= 2) speedIdx = v; } catch (e) { /* ignore */ }
function setSpeed(i) {
  speedIdx = clamp(i, 0, 2);
  try { localStorage.setItem('kansei.speed', String(speedIdx)); } catch (e) { /* ignore */ }
}
const gunTime = k => 0.3 * Math.pow(k, 0.8);     // a burst of fire before a kill
const fallTime = k => 0.55 * Math.pow(k, 0.85);  // a downed plane's fall

function commit(o) {
  if (!o || G.over || busy()) return;
  const P = G.player;
  const K = SPEEDS[speedIdx];
  const STEP = 0.06 * K, LEAD = 0.28 * Math.sqrt(K), OUT = 0.3 * Math.sqrt(K);
  const now = G.clock + LEAD;   // the flight begins once the camera has tilted
  G.oldMarks = G.enemies.map(e => ({ id: e.id, type: e.type, cells: e.marks.slice(), aim: e.aim }));
  G.deadAt = new Map();
  G.path = o.path;
  const pathDur = Math.max(0.12 * K, (o.path.length - 1) * STEP);
  const enemyT = now + pathDur + 0.05 * K;
  G.tl = { tStart: G.clock, t0: now, pathEnd: now + pathDur, enemyT, end: enemyT + 0.42 * K, step: STEP, lead: LEAD, out: OUT, k: K };
  G.lastPath = { cells: o.path.map(p => [p.x, p.y]), t: now };
  G.guns = [];
  G.maneuvers = planManeuvers(o, now, STEP, !!(o.crash || o.clank));
  Sfx.move(o.speed, LEAD);
  for (const b of o.bounces) {
    const idx = Math.max(1, o.path.findIndex(p => p.x === b.cx && p.y === b.cy));
    const t = now + Math.max(0, idx) * STEP;
    G.bumpT.set(b.cell[1] * N + b.cell[0], t);
    G.rings.push({ x: b.cell[0] + 0.5, y: b.cell[1] + 0.5, t, life: 0.55, color: '#b4f2ff', r: 1.7 });
    sparks(b.cell[0] + 0.5, b.cell[1] + 0.5, 0.6, t, '#d8f8ff', 9);
    Sfx.bounce(t - G.clock);
  }
  if (o.crash || o.clank) { Sfx.crash(pathDur + LEAD); G.shakeAt = now + pathDur; G.shakeAmp = 4; }
  for (const m of G.maneuvers) Sfx.sweepUp(m.tb - m.w - G.clock, m.w * 2.4);

  // kills
  const nk = o.kills.length + (o.stomp ? 1 : 0);
  if (nk > 0) G.streak = Math.min(9, G.streak + 1); else G.streak = 0;
  const mult = Math.max(1, G.streak);
  let lastDown = 0;
  o.kills.forEach((k, i) => {
    const t = now + k.step * STEP;
    const e = k.e;
    const fall = fallTime(K);
    G.deadAt.set(e.id, t);
    // a burst of cannon fire, then the plane goes down trailing fire and crashes into the sea
    const gd = gunTime(K);
    G.guns.push({ x: e.x + 0.5, y: e.y + 0.5, z: enemyAlt(e.id), t0: t - gd, t1: t });
    Sfx.gun(t - gd - G.clock, gd);
    const hd = e.hd == null ? 0 : e.hd;
    const drift = 1.6 + 0.6 * ((e.id * 7) % 3);
    const landX = clamp(e.x + 0.5 + Math.cos(hd) * drift, 0.5, N - 0.5), landY = clamp(e.y + 0.5 + Math.sin(hd) * drift, 0.5, N - 0.5);
    G.corpses.push({ type: e.type, x: e.x, y: e.y, hd, armor: e.armor, id: e.id, t, fall, lx: landX, ly: landY, spin: (e.id % 2 ? 1 : -1) * (9 + (e.id % 4)) });
    addScore(10 * (i + 1) * mult, e.x, e.y, t, i >= 1);
    Sfx.kill(i, t - G.clock);
    sparks(e.x + 0.5, e.y + 0.5, enemyAlt(e.id), t, '#ffe28a', 10);
    addP({ kind: 'fire', x: e.x + 0.5, y: e.y + 0.5, z: enemyAlt(e.id), vx: 0, vy: 0, vz: 0.2, t, life: 0.3, size: 0.6, core: true });
    // fire and smoke along the way down
    for (let q = 1; q <= 9; q++) {
      const u = q / 10, tt = t + fall * u;
      const [fx, fy, fz] = fallPos(e.x + 0.5, e.y + 0.5, enemyAlt(e.id), landX, landY, u);
      addP({ kind: 'smoke', x: fx, y: fy, z: fz, vx: 0, vy: 0, vz: 0.15, t: tt, life: 0.9, size: 0.55 });
      if (q % 2) addP({ kind: 'fire', x: fx, y: fy, z: fz, vx: 0, vy: 0, vz: 0.2, t: tt, life: 0.3, size: 0.4 });
    }
    // the impact
    const tc = t + fall;
    explode(landX, landY, 0.3, tc, 1.5 + 0.1 * i);
    impact(landX, landY, tc, 1.6);
    G.rings.push({ x: landX, y: landY, t: tc, life: 0.8, color: '#e8f6ff', r: 2.4 });
    Sfx.fall(t - G.clock, fall);
    Sfx.boom(tc - G.clock, 0.2);
    lastDown = Math.max(lastDown, tc);
  });
  G.enemies = G.enemies.filter(e => !o.killSet.has(e));
  if (o.stomp) {
    G.spawns = G.spawns.filter(s => s !== o.stomp);
    const t = now + pathDur;
    addScore(10 * (o.kills.length + 1) * mult, o.stomp.x, o.stomp.y, t, false);
    explode(o.stomp.x + 0.5, o.stomp.y + 0.5, 0.4, t, 0.7);
    Sfx.kill(o.kills.length, pathDur + LEAD);
  }
  G.killed += nk;
  if (nk >= 2) { G.shakeAt = now + pathDur; G.shakeAmp = Math.min(10, 2 + nk * 2); }

  P.x = o.ex; P.y = o.ey; P.vx = o.vx; P.vy = o.vy;

  if (floorDone()) {
    clearFloor(enemyT);
  } else {
    enemyPhase(enemyT);
  }
  G.turn++;
  G.options = [];
  G.markers = [];
  G.hover = null;
  G.selected = null;
  // let a falling plane reach the sea before the camera comes back
  G.tl.end = Math.max(G.tl.end, lastDown + 0.35 * K);
  G.lastPath.endT = G.tl.end;
}

function clearFloor(t) {
  const bonus = 50 * G.floor;
  addScore(bonus, G.player.x, G.player.y, t, true);
  G.pendingClear = true;
  G.tl.end = t + 0.9 * Math.sqrt(G.tl.k);
  G.clearT = t;
  setTimeout(() => Sfx.clear(), Math.max(0, (t - G.clock) * 1000));
}

function enemyPhase(t) {
  const P = G.player;
  const mult = Math.max(1, G.streak);
  // 1. attacks
  let hurt = false;
  const firing = G.enemies.filter(e => e.marks.length);
  const friendly = new Set();
  for (const e of firing) {
    G.flashes.push({ cells: e.marks.slice(), color: TYPES[e.type].color, t });
    e.marks.forEach(([mx, my], mi) => {
      if (mi % (e.marks.length > 6 ? 2 : 1) === 0) impact(mx + 0.5, my + 0.5, t + 0.04 + 0.025 * (mi % 5), 0.55);
    });
    Sfx.boom(t - G.clock + 0.05, 0.07);
    for (const [x, y] of e.marks) {
      if (x === P.x && y === P.y) hurt = true;
      if (e.type === 'lancer' || e.type === 'mortar') {
        const o = enemyAt(x, y);
        if (o && o !== e) friendly.add(o);
      }
    }
    if (e.type === 'lancer' || e.type === 'mortar') {
      e.cd = 1;
      Sfx.fire(t - G.clock);
    }
  }
  let fi = 0;
  for (const o of friendly) {
    G.deadAt.set(o.id, t + 0.08);
    G.corpses.push({ type: o.type, x: o.x, y: o.y, hd: o.hd, armor: o.armor, id: o.id, t: t + 0.08, fall: 0.001 });
    addScore(10 * mult, o.x, o.y, t + 0.08, false);
    explode(o.x + 0.5, o.y + 0.5, 1.25, t + 0.08, 1);
    Sfx.kill(fi++, t + 0.08 - G.clock);
    G.killed++;
  }
  G.enemies = G.enemies.filter(e => !friendly.has(e));
  if (hurt) {
    P.hp--;
    G.floorHurt = true;
    G.streak = 0;
    G.hurtT = t;
    G.shakeAt = t;
    G.shakeAmp = 9;
    explode(P.x + 0.5, P.y + 0.5, 1.25, t + 0.04, P.hp <= 0 ? 1.7 : 1.1);
    Sfx.hurt(t - G.clock);
    if (P.hp <= 0) {
      G.over = true;
      G.overT = t + 0.5;
      if (G.score > G.best) { G.best = G.score; G.newBest = true; try { localStorage.setItem('kansei.best', String(G.best)); } catch (e) { /* ignore */ } }
      setTimeout(() => Sfx.over(), Math.max(0, (t + 0.3 - G.clock) * 1000));
      return;
    }
  }
  if (floorDone()) { clearFloor(t + 0.3); return; }

  // 2. arrivals
  const still = [];
  for (const s of G.spawns) {
    if (s.due <= G.turn && freeCell(s.x, s.y)) {
      const e = makeEnemy(s.type, s.x, s.y);
      e.bornT = t + 0.12 * G.tl.k;
      e.arrive = true;
      G.enemies.push(e);
      Sfx.spawn(t + 0.12 * G.tl.k - G.clock);
    } else still.push(s);
  }
  G.spawns = still;

  // 3. movement
  const d = distMap();
  const order = G.enemies.slice().sort((a, b) => d[a.y * N + a.x] - d[b.y * N + b.x]);
  for (const e of order) {
    e.fx = e.x; e.fy = e.y;
    moveEnemy(e, d);
    e.mt0 = t + 0.12 * G.tl.k;
    e.mt1 = t + 0.32 * G.tl.k;
  }
  // newcomers fly in from beyond the edge of the board
  for (const e of G.enemies) {
    if (!e.arrive) continue;
    e.arrive = false;
    const vx = e.x + 0.5 - N / 2, vy = e.y + 0.5 - N / 2, L = Math.hypot(vx, vy) || 1;
    e.fx = e.x + (vx / L) * N * 0.8;
    e.fy = e.y + (vy / L) * N * 0.8;
    e.mt0 = e.bornT;
    e.mt1 = e.bornT + 0.45 * G.tl.k;
  }

  // 4. intentions
  for (const e of G.enemies) computeMarks(e);
  ensureEscape(hurt);

  // 5. reinforcements
  const onBoard = G.enemies.length + G.spawns.length;
  const remaining = G.quota - G.killed - onBoard;
  if (remaining > 0 && onBoard < G.cap && (G.floor >= 4 || G.turn % 2 === 0 || onBoard < 2)) {
    const c = placeSpawn(3);
    if (c) G.spawns.push({ x: c[0], y: c[1], type: pickType(), due: G.turn + 1, t: t + 0.3 });
  }
}

function busy() { return G.tl && G.clock < G.tl.end; }

// ============================================================ flight plans
// Altitudes are in cells above the sea. The glass cube above the board is CUBE_H high.
const CUBE_H = N;   // a true cube: as tall as the board is wide
const enemyAlt = id => 3.0 + 0.9 * ((id * 5) % 4) / 3;      // 3.0 .. 3.9
const playerAlt = 3.4;
function fallPos(sx, sy, sz, lx, ly, u) {
  const e = u * u;
  return [sx + (lx - sx) * u, sy + (ly - sy) * u, sz * (1 - e) + 0.05];
}
// Where the flight turns back on itself, a fighter pulls an Immelmann turn: a half loop
// up and over, then a half roll to level out facing the way it came.
function planManeuvers(o, t0, step, crashed) {
  const out = [];
  const pts = o.path;
  let prev = null, hPrev = null;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    if (!dx && !dy) continue;
    const L = Math.hypot(dx, dy);
    if (prev) {
      const dot = (prev[0] * dx + prev[1] * dy) / (prev[2] * L);
      if (dot < -0.6) out.push({ tb: t0 + (i - 1) * step, h0: hPrev, crash: false });
    }
    prev = [dx, dy, L];
    hPrev = Math.atan2(dy, dx);
  }
  if (crashed && prev) out.push({ tb: t0 + (pts.length - 1) * step, h0: hPrev, crash: true });
  for (const m of out) m.w = clamp(2.2 * step, 0.22, 0.42);
  // keep them apart
  return out.filter((m, i) => i === 0 || m.tb - out[i - 1].tb > 4 * Math.max(m.w, out[i - 1].w));
}

// ============================================================ fx
// Particles live in board coordinates (cells) plus an altitude, and are drawn as billboards.
function addP(p) { G.particles.push(p); }

// a plane blowing up in mid-air: fire, smoke, flying wreckage
function explode(x, y, z, t, size) {
  const sz = size || 1;
  for (let i = 0; i < 5; i++) {
    const a = rnd() * TAU, v = 0.5 + rnd() * 1.1;
    addP({ kind: 'fire', x, y, z, vx: Math.cos(a) * v * 0.5, vy: Math.sin(a) * v * 0.5, vz: 0.3 + rnd() * 0.6, t: t + i * 0.015, life: 0.5 + rnd() * 0.3, size: sz * (0.55 + rnd() * 0.5) });
  }
  addP({ kind: 'fire', x, y, z, vx: 0, vy: 0, vz: 0, t, life: 0.35, size: sz * 1.25, core: true });
  for (let i = 0; i < 5; i++) {
    const a = rnd() * TAU, v = 0.3 + rnd() * 0.7;
    addP({ kind: 'smoke', x, y, z, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v * 0.6, vz: 0.5 + rnd() * 0.5, t: t + 0.08 + i * 0.03, life: 0.9 + rnd() * 0.5, size: sz * (0.5 + rnd() * 0.4) });
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, v = 1.4 + rnd() * 2.8;
    addP({ kind: 'debris', x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 1 + rnd() * 2.4, t, life: 0.55 + rnd() * 0.5, size: 0.7 + rnd() * 0.9, rot: rnd() * TAU, spin: (rnd() - 0.5) * 14, color: ['#d6403a', '#f4f7fb', '#3a4560', '#ffb03a'][i % 4] });
  }
  sparks(x, y, z, t, '#ffe28a', 8);
  G.rings.push({ x, y, t, life: 0.5, color: '#fff3c0', r: 1.4 * sz });
}

function sparks(x, y, z, t, color, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, v = 1.5 + rnd() * 3;
    addP({ kind: 'spark', x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: (rnd() - 0.3) * 2, t, life: 0.25 + rnd() * 0.25, size: 1, color });
  }
}

// a shell landing on the sea
function impact(x, y, t, size) {
  addP({ kind: 'fire', x, y, z: 0.15, vx: 0, vy: 0, vz: 0.5, t, life: 0.4, size: size * 0.8, core: true });
  addP({ kind: 'smoke', x, y, z: 0.2, vx: 0, vy: 0, vz: 0.6, t: t + 0.05, life: 0.7, size: size * 0.6 });
  addP({ kind: 'spray', x, y, z: 0.1, vx: 0, vy: 0, vz: 1.2, t, life: 0.45, size });
  G.rings.push({ x, y, t, life: 0.4, color: '#ffd9a0', r: 0.6 * size });
}

// ============================================================ update
function update() {
  if (G.tl && !busy()) {
    G.tl = null;
    G.path = null;
    if (G.pendingClear) nextFloor();
    else if (!G.over) computeOptions();
  }
  G.particles = G.particles.filter(p => G.clock < p.t + p.life);
  G.popups = G.popups.filter(p => G.clock < p.t + 1.0);
  G.flashes = G.flashes.filter(f => G.clock < f.t + 0.35);
  G.rings = G.rings.filter(r => G.clock < r.t + r.life);
}

// ============================================================ draw
// The board is shown two ways: straight down while you choose, and tilted like
// a diorama while the move plays out. Ground-plane drawing (cells, marks,
// paths) goes through one affine transform; things with height (islands,
// aircraft, explosions) are projected point by point. At rest the transform is
// the identity, so the overhead view is exactly the plain board.
const X = x => OX + x * CELL, Y = y => OY + y * CELL;
const CX = x => OX + (x + 0.5) * CELL, CY = y => OY + (y + 0.5) * CELL;

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SANS = 'ui-rounded, "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif';
const ART = {
  sea: ['#2f78ae', '#2b70a6'], seaBase: '#2a6a9e', sand: '#dccb9b', grid: 'rgba(176,220,248,0.34)',
  moss: ['#7aa646', '#6f9a3a', '#83ad4b'], mossDark: '#5a8430', rock: '#93857a', rockDark: '#6f6359', rockLight: '#a9998c',
  slab: '#18446f', slabDark: '#0e2c50', navy: '#0f2b4d', white: '#f6f9fc',
  cyan: '#78e8ff', yellow: '#ffd93b', red: '#ff4a3d',
};
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = v => v * v * (3 - 2 * v);

// ---------------------------------------------------------------- textures (built once, a little at a time)
const TEX = { rock: null, moss: null, rockPat: null, mossPat: null, sky: null, slab: [], pine: null, smoke: null, fire: null, trail: null };
(function buildTextures() {
  const A = window.KanseiArt;
  if (!A) return;
  const steps = [
    () => { TEX.pine = A.pine(); TEX.smoke = A.softPuff('smoke'); TEX.fire = A.softPuff('fire'); TEX.trail = A.softPuff('trail'); },
    () => { TEX.rock = A.rock(); TEX.rockPat = ctx.createPattern(TEX.rock, 'repeat'); },
    () => { TEX.moss = A.moss(); TEX.mossPat = ctx.createPattern(TEX.moss, 'repeat'); },
    () => { TEX.sky = A.sky(2048, 1024, () => { TEX.skyDone = true; }); },
    () => { TEX.slab[0] = A.slab(1024, 224, 1); },
    () => { TEX.slab[1] = A.slab(1024, 224, 2); },
    () => { TEX.slab[2] = A.slab(1024, 224, 3); },
    () => { TEX.slab[3] = A.slab(1024, 224, 4); },
  ];
  let i = 0;
  (function next() { if (i < steps.length) { steps[i++](); setTimeout(next, 30); } })();
})();
// put a texture on a parallelogram: texture (0,0) at O, its x axis along ex, y axis along ey (screen px per texture px)
const patM = (O, ex, ey) => new DOMMatrix([ex[0], ex[1], ey[0], ey[1], O[0], O[1]]);
function patFill(pat, O, ex, ey) { pat.setTransform(patM(O, ex, ey)); ctx.fillStyle = pat; }

// ---------------------------------------------------------------- camera
const ZOOM_ACT = 1.75, ZOOM_ENEMY = 1.4;
const CAM = { fx: N / 2, fy: N / 2, zf: ZOOM_ACT, last: null, t: 0, sinP: 1, cosP: 0, c: 1, s: 0, zoom: 1, bx: 0, by: 0, bx0: 0, by0: 0, shx: 0, shy: 0 };
const PITCH_DOWN = Math.PI / 2, PITCH_FLY = 0.62, YAW_FLY = -0.55, SLAB_D = 2.4;
function updateCam(now) {
  let t = 0;
  const tl = G.tl;
  if (tl) {
    const up = clamp((now - tl.tStart) / tl.lead, 0, 1);
    const dn = clamp((tl.end - now) / tl.out, 0, 1);
    t = smooth(Math.min(up, dn));
  }
  CAM.t = t;
  const phi = PITCH_DOWN + (PITCH_FLY - PITCH_DOWN) * t;
  const yaw = YAW_FLY * t;
  CAM.sinP = Math.sin(phi); CAM.cosP = Math.cos(phi);
  CAM.c = Math.cos(yaw); CAM.s = Math.sin(yaw);
  // close in on the action: follow the player's plane, then ease back to take in the enemy's reply
  const spread = Math.cos(YAW_FLY) + Math.abs(Math.sin(YAW_FLY));
  const fit = Math.min(1.06, (VW - 14) / (N * CELL * spread));
  let tx = N / 2, ty = N / 2, zf = ZOOM_ACT;
  if (tl) {
    const [px, py] = playerPos(now);
    const e = smooth(clamp((now - tl.pathEnd) / 0.35, 0, 1));
    tx = px + 0.5 + (N / 2 - px - 0.5) * 0.45 * e;
    ty = py + 0.5 + (N / 2 - py - 0.5) * 0.45 * e;
    zf = ZOOM_ACT + (ZOOM_ENEMY - ZOOM_ACT) * e;
  }
  const dtc = Math.min(0.1, Math.max(0, now - (CAM.last == null ? now : CAM.last)));
  CAM.last = now;
  const k = t < 0.02 ? 1 : Math.min(1, dtc * 7);
  CAM.fx += (tx - CAM.fx) * k; CAM.fy += (ty - CAM.fy) * k; CAM.zf += (zf - CAM.zf) * k;
  CAM.zoom = 1 + (fit * CAM.zf - 1) * t;
  CAM.bx0 = OX + N * CELL / 2;
  CAM.by0 = OY + N * CELL / 2;
  let shx = 0, shy = 0;
  if (G.shakeAt != null) {
    const k = now - G.shakeAt;
    if (k >= 0 && k < 0.3) {
      const amp = (G.shakeAmp || 6) * (1 - k / 0.3);
      shx = (Math.random() - 0.5) * amp;
      shy = (Math.random() - 0.5) * amp;
    }
  }
  // put the followed point on the middle of the screen (below the HUD)
  const half = Math.max(2.5, VW / (CELL * CAM.zoom) / 2 / spread);
  const fx = clamp(CAM.fx, Math.min(half, N / 2), Math.max(N - half, N / 2)), fy = clamp(CAM.fy, 2.5, N - 2.5);
  const uf = X(fx) - CAM.bx0, vf = Y(fy) - CAM.by0, z = CAM.zoom;
  const bxF = VW / 2 - (uf * CAM.c - vf * CAM.s) * z;
  const byF = (70 + VH - 14) / 2 + 0.06 * VH - (uf * CAM.s + vf * CAM.c) * CAM.sinP * z + 1.9 * CELL * CAM.cosP * z;
  CAM.bx = CAM.bx0 + t * (bxF - CAM.bx0) + shx;
  CAM.by = CAM.by0 + t * (byF - CAM.by0) + shy;
}
// board cell units (x, y, height in cells) -> screen pixels
function proj(x, y, z) {
  const u = X(x) - CAM.bx0, v = Y(y) - CAM.by0;
  return [CAM.bx + (u * CAM.c - v * CAM.s) * CAM.zoom, CAM.by + (u * CAM.s + v * CAM.c) * CAM.sinP * CAM.zoom - z * CELL * CAM.cosP * CAM.zoom];
}
function depthOf(x, y) { return (X(x) - CAM.bx0) * CAM.s + (Y(y) - CAM.by0) * CAM.c; }
function groundOn() {
  const a = CAM.zoom * CAM.c, b = CAM.zoom * CAM.sinP * CAM.s, c = -CAM.zoom * CAM.s, d = CAM.zoom * CAM.sinP * CAM.c;
  const e = CAM.bx - a * CAM.bx0 - c * CAM.by0, f = CAM.by - b * CAM.bx0 - d * CAM.by0;
  ctx.setTransform(DPR * a, DPR * b, DPR * c, DPR * d, DPR * e, DPR * f);
}
function groundOff() { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
function poly(pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}
function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a;
}

// ---------------------------------------------------------------- sky, the cube, the base
// the room around the diorama: pale, with the model's shadow on the table
function drawRoom() {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#f6f9fc'); g.addColorStop(1, '#d9e5f1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  if (CAM.t > 0.02) {
    const [sx, sy] = proj(N / 2 + 0.5, N / 2 + 0.9, -SLAB_D - 0.05);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.32);
    const w = N * CELL * 0.82 * CAM.zoom;
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
    sg.addColorStop(0, `rgba(60,85,120,${0.3 * CAM.t})`);
    sg.addColorStop(1, 'rgba(60,85,120,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(0, 0, w, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
const CUBE_FACES = [[[0, N], [N, N]], [[N, N], [N, 0]], [[N, 0], [0, 0]], [[0, 0], [0, N]]];  // south, east, north, west
function cubeQuad(f) {
  const [a, b] = f;
  return [proj(a[0], a[1], 0), proj(b[0], b[1], 0), proj(b[0], b[1], CUBE_H), proj(a[0], a[1], CUBE_H)];
}
// the far walls of the glass cube: the sky seen from inside
function drawCubeBack(now) {
  if (CAM.t < 0.02) return;
  ctx.globalAlpha = CAM.t;
  CUBE_FACES.forEach((f, fi) => {
    const q = cubeQuad(f);
    if (area(q) <= 0.5) return;
    if (TEX.sky && TEX.skyDone) {
      // the far wall is a photograph of sky: map the picture onto it
      ctx.save();
      poly(q);
      ctx.clip();
      const O = q[3], ex = [(q[2][0] - q[3][0]) / 1024, (q[2][1] - q[3][1]) / 1024], ey = [(q[0][0] - q[3][0]) / 1024, (q[0][1] - q[3][1]) / 1024];
      ctx.transform(ex[0], ex[1], ey[0], ey[1], O[0], O[1]);
      ctx.drawImage(TEX.sky, (fi % 2) * 1024, 0, 1024, 1024, 0, 0, 1024, 1024);
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0, q[3][1], 0, q[0][1]);
      g.addColorStop(0, '#3d8cdc'); g.addColorStop(0.55, '#79b8ee'); g.addColorStop(1, '#d4eafb');
      ctx.fillStyle = g;
      poly(q);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}
// the near walls: clear glass, seen only by its edges and a faint sheen
function drawCubeFront(now) {
  if (CAM.t < 0.02) return;
  ctx.globalAlpha = CAM.t;
  const topPts = [[0, 0], [N, 0], [N, N], [0, N]].map(c => proj(c[0], c[1], CUBE_H));
  CUBE_FACES.forEach((f) => {
    const q = cubeQuad(f);
    if (area(q) >= -0.5) return;
    const g = ctx.createLinearGradient(q[3][0], q[3][1], q[1][0], q[1][1]);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.2)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.03)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    poly(q);
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.6;
  poly(topPts);
  ctx.stroke();
  // the vertical edges, dashed like the drawing
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  for (const [cx0, cy0] of [[0, 0], [N, 0], [N, N], [0, N]]) {
    const a = proj(cx0, cy0, 0), b = proj(cx0, cy0, CUBE_H);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
// the model's base, cut away: sea above, stacked stone below
function drawSlab() {
  const D = SLAB_D;
  const faces = [[[0, N], [N, N]], [[N, N], [N, 0]], [[N, 0], [0, 0]], [[0, 0], [0, N]]];
  faces.forEach((f, fi) => {
    const [a, b] = f;
    const quad = [proj(a[0], a[1], 0), proj(b[0], b[1], 0), proj(b[0], b[1], -D), proj(a[0], a[1], -D)];
    if (area(quad) <= 0.5) return;
    const tx = TEX.slab[fi];
    if (tx) {
      ctx.save();
      ctx.transform((quad[1][0] - quad[0][0]) / tx.width, (quad[1][1] - quad[0][1]) / tx.width, (quad[3][0] - quad[0][0]) / tx.height, (quad[3][1] - quad[0][1]) / tx.height, quad[0][0], quad[0][1]);
      ctx.drawImage(tx, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1d5c8c';
      poly(quad);
      ctx.fill();
    }
    // glass over the cut: a soft sheen and a bright lip where the water meets the top
    const sg = ctx.createLinearGradient(quad[0][0], quad[0][1], quad[1][0], quad[1][1]);
    sg.addColorStop(0, 'rgba(255,255,255,0.1)'); sg.addColorStop(0.35, 'rgba(255,255,255,0)'); sg.addColorStop(0.6, 'rgba(255,255,255,0.12)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    poly(quad);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,244,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(quad[0][0], quad[0][1]); ctx.lineTo(quad[1][0], quad[1][1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(quad[3][0], quad[3][1]); ctx.lineTo(quad[2][0], quad[2][1]); ctx.stroke();
  });
}

// ---------------------------------------------------------------- aircraft
// real aircraft, seen from above: F-22 (you), F-16, A-10, MiG-31, B-2
const JET = {
  player: { model: 'f22', L: 1.02, body: '#cfd7e0', wing: '#a7b2bf', accent: '#3a6fb8', canopy: '#2b4a6c' },
  spike: { model: 'f16', L: 0.9, body: '#d2403a', wing: '#a82b2f', accent: '#24305e', canopy: '#1b2447' },
  shell: { model: 'a10', L: 1.02, body: '#b83a34', wing: '#8f2b2b', accent: '#4a2330', canopy: '#1b2447', pips: true },
  lancer: { model: 'mig31', L: 1.2, body: '#d9503a', wing: '#b33c33', accent: '#ffb03a', canopy: '#1b2447' },
  mortar: { model: 'b2', L: 1.08, body: '#7a2736', wing: '#5f1d2b', accent: '#d467d9', canopy: '#1b1020' },
};
// each shape: [fore-aft, sideways, height] in fractions of the plane's length; g mirrors it
const SHAPES = {
  f22: g => ({
    tails: [[-0.5, 0.04], [-0.5, -0.04]],
    p: [
      { k: 'wing', p: [[0.1, 0.08 * g], [-0.12, 0.38 * g], [-0.2, 0.38 * g], [-0.3, 0.09 * g]] },
      { k: 'wing', p: [[-0.3, 0.08 * g], [-0.44, 0.22 * g], [-0.5, 0.21 * g], [-0.46, 0.08 * g]] },
      { k: 'accent', fin: true, p: [[-0.28, 0.07 * g, 0.02], [-0.48, 0.08 * g, 0.02], [-0.52, 0.15 * g, 0.2], [-0.42, 0.14 * g, 0.2]] },
    ],
  }),
  f16: g => ({
    tails: [[-0.5, 0]],
    p: [
      { k: 'wing', p: [[0.0, 0.07 * g], [-0.16, 0.3 * g], [-0.26, 0.3 * g], [-0.26, 0.07 * g]] },
      { k: 'wing', p: [[0.2, 0.05 * g], [0.02, 0.15 * g], [0.0, 0.07 * g]] },
      { k: 'wing', p: [[-0.36, 0.07 * g], [-0.46, 0.19 * g], [-0.5, 0.19 * g], [-0.5, 0.06 * g]] },
    ],
  }),
  a10: g => ({
    tails: [[-0.5, 0.105], [-0.5, -0.105]],
    p: [
      { k: 'wing', p: [[0.1, 0.07 * g], [0.1, 0.5 * g], [-0.08, 0.5 * g], [-0.12, 0.07 * g]] },
      { k: 'accent', p: [[-0.05, 0.1 * g], [-0.05, 0.48 * g], [-0.08, 0.5 * g], [-0.12, 0.07 * g]] },
      { k: 'wing', p: [[-0.38, 0.06 * g], [-0.38, 0.27 * g], [-0.48, 0.27 * g], [-0.5, 0.06 * g]] },
      { k: 'accent', fin: true, p: [[-0.38, 0.27 * g, 0.0], [-0.48, 0.27 * g, 0.0], [-0.5, 0.27 * g, 0.24], [-0.42, 0.27 * g, 0.24]] },
      { k: 'accent', p: [[-0.02, 0.08 * g, 0.08], [-0.1, 0.065 * g, 0.08], [-0.5, 0.07 * g, 0.07], [-0.5, 0.14 * g, 0.07], [-0.1, 0.155 * g, 0.08], [-0.02, 0.125 * g, 0.08]] },
    ],
  }),
  mig31: g => ({
    tails: [[-0.52, 0.07], [-0.52, -0.07]],
    p: [
      { k: 'wing', p: [[0.04, 0.15 * g], [-0.2, 0.4 * g], [-0.32, 0.4 * g], [-0.34, 0.15 * g]] },
      { k: 'wing', p: [[-0.38, 0.13 * g], [-0.5, 0.26 * g], [-0.56, 0.26 * g], [-0.54, 0.12 * g]] },
      { k: 'canopy', p: [[0.2, 0.09 * g, 0.01], [0.2, 0.14 * g, 0.01], [0.06, 0.15 * g, 0.01], [0.06, 0.1 * g, 0.01]] },
      { k: 'accent', fin: true, p: [[-0.3, 0.17 * g, 0.03], [-0.5, 0.17 * g, 0.03], [-0.55, 0.17 * g, 0.3], [-0.43, 0.17 * g, 0.3]] },
    ],
  }),
  b2: g => ({
    tails: [[-0.22, 0.09], [-0.22, -0.09]],
    p: [
      { k: 'wing', p: [[0.3, 0], [-0.16, 0.62 * g], [-0.2, 0.6 * g], [-0.08, 0.44 * g], [-0.2, 0.3 * g], [-0.1, 0.16 * g], [-0.22, 0.08 * g], [-0.24, 0]] },
      { k: 'accent', p: [[0.18, 0.02 * g], [0.0, 0.14 * g], [-0.02, 0.1 * g], [0.1, 0.0]] },
    ],
  }),
};
const BODIES = {
  f22: [[0.5, 0], [0.32, 0.045], [0.12, 0.1], [-0.1, 0.11], [-0.34, 0.09], [-0.5, 0.06], [-0.5, -0.06], [-0.34, -0.09], [-0.1, -0.11], [0.12, -0.1], [0.32, -0.045]],
  f16: [[0.5, 0], [0.34, 0.04], [0.1, 0.075], [-0.2, 0.08], [-0.42, 0.07], [-0.5, 0.05], [-0.5, -0.05], [-0.42, -0.07], [-0.2, -0.08], [0.1, -0.075], [0.34, -0.04]],
  a10: [[0.5, 0], [0.4, 0.05], [0.2, 0.075], [-0.1, 0.07], [-0.4, 0.045], [-0.5, 0.03], [-0.5, -0.03], [-0.4, -0.045], [-0.1, -0.07], [0.2, -0.075], [0.4, -0.05]],
  mig31: [[0.52, 0], [0.36, 0.045], [0.18, 0.11], [0.0, 0.15], [-0.3, 0.15], [-0.5, 0.11], [-0.5, -0.11], [-0.3, -0.15], [0.0, -0.15], [0.18, -0.11], [0.36, -0.045]],
  b2: null,
};
const CANOPIES = {
  f22: [[0.32, 0, 0.03], [0.2, 0.04, 0.06], [0.04, 0.04, 0.06], [0.0, 0, 0.04], [0.04, -0.04, 0.06], [0.2, -0.04, 0.06]],
  f16: [[0.3, 0, 0.03], [0.2, 0.045, 0.06], [0.0, 0.045, 0.06], [-0.04, 0, 0.04], [0.0, -0.045, 0.06], [0.2, -0.045, 0.06]],
  a10: [[0.34, 0, 0.03], [0.24, 0.035, 0.05], [0.1, 0.035, 0.05], [0.06, 0, 0.03], [0.1, -0.035, 0.05], [0.24, -0.035, 0.05]],
  mig31: [[0.34, 0, 0.03], [0.24, 0.04, 0.06], [0.1, 0.04, 0.06], [0.08, 0, 0.04], [0.1, -0.04, 0.06], [0.24, -0.04, 0.06]],
  b2: [[0.16, 0, 0.02], [0.08, 0.025, 0.03], [0.02, 0, 0.02], [0.08, -0.025, 0.03]],
};
// the aircraft as flat panels, turned by heading, pitch (nose up) and roll (about its own axis)
function jetPolys(sp, ox, oy, oz, hd, pitch, roll) {
  const dx = Math.cos(hd), dy = Math.sin(hd), rx = -dy, ry = dx;
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), spn = Math.sin(pitch);
  const L = sp.L;
  const T = (f, r, zz) => {
    const z0 = (zz || 0) * L;
    const r0 = r * L;
    const r1 = r0 * cr - z0 * sr, z1 = r0 * sr + z0 * cr;
    const f0 = f * L;
    const f2 = f0 * cp - z1 * spn, z2 = f0 * spn + z1 * cp;
    return [ox + f2 * dx + r1 * rx, oy + f2 * dy + r1 * ry, oz + z2];
  };
  const out = [];
  const panel = (c, pts, extra) => out.push(Object.assign({ c, p: pts.map(q => T(q[0], q[1], q[2])) }, extra));
  const col = k => (k === 'wing' ? sp.wing : k === 'accent' ? sp.accent : k === 'canopy' ? sp.canopy : sp.body);
  const parts = [SHAPES[sp.model](1), SHAPES[sp.model](-1)];
  // panels that lie flat go under the fuselage; fins and pods on top
  for (const pt of parts) for (const q of pt.p) if (!q.fin) panel(col(q.k), q.p);
  if (BODIES[sp.model]) panel(sp.body, BODIES[sp.model], { body: true });
  else { // the flying wing is all one body: lay a lighter hump down its middle
    const hump = [[0.26, 0], [0.02, 0.1], [-0.2, 0.06], [-0.22, 0], [-0.2, -0.06], [0.02, -0.1]];
    panel(sp.body, hump, { body: true });
  }
  for (const pt of parts) for (const q of pt.p) if (q.fin) panel(col(q.k), q.p, { fin: true });
  panel(sp.canopy, CANOPIES[sp.model], { canopy: true });
  out.tails = parts[0].tails.map(t => T(t[0], t[1], 0));
  return out;
}

function shadeHex(h, k) {
  const n = parseInt(h.slice(1), 16);
  return `rgb(${Math.min(255, Math.round((n >> 16) * k))},${Math.min(255, Math.round(((n >> 8) & 255) * k))},${Math.min(255, Math.round((n & 255) * k))})`;
}
function drawJet(j) {
  const sp = JET[j.type];
  const polys = jetPolys(sp, j.x, j.y, j.z, j.hd, j.pitch || 0, j.roll || 0);
  ctx.globalAlpha = j.alpha == null ? 1 : j.alpha;
  ctx.lineJoin = 'round';
  // panels facing away from the viewer are drawn first, so a banked wing doesn't cover the body
  for (const q of polys) {
    const pts = q.p.map(p => proj(p[0], p[1], p[2]));
    if (q.fin && CAM.cosP < 0.12) continue;
    // lit by the sun: the brightness follows the way each panel faces
    const A = q.p[0], B = q.p[1], C = q.p[2];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const dl = Math.abs((nx * -0.35 + ny * -0.45 + nz * 0.82) / nl);
    const k = 0.62 + 0.62 * dl;
    ctx.fillStyle = shadeHex(q.c, k);
    poly(pts);
    ctx.fill();
    if (q.body) {
      // a long highlight down the fuselage, and a darker belly
      const nose = pts[0], tailp = pts[3];
      const lg = ctx.createLinearGradient(nose[0], nose[1], tailp[0], tailp[1]);
      lg.addColorStop(0, 'rgba(255,255,255,0.4)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.02)'); lg.addColorStop(1, 'rgba(0,10,30,0.3)');
      ctx.fillStyle = lg;
      poly(pts);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(10,28,58,0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (q.canopy) {
      const cx0 = (pts[0][0] + pts[2][0]) / 2, cy0 = (pts[0][1] + pts[2][1]) / 2, rr = Math.hypot(pts[0][0] - pts[2][0], pts[0][1] - pts[2][1]) * 0.45;
      const cg = ctx.createRadialGradient(cx0 - rr * 0.3, cy0 - rr * 0.35, 0, cx0, cy0, rr);
      cg.addColorStop(0, 'rgba(210,235,255,0.85)'); cg.addColorStop(0.5, 'rgba(120,170,230,0.25)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx0, cy0, rr, 0, TAU); ctx.fill();
    }
  }
  if (sp.pips && !j.roll) {
    const dx = Math.cos(j.hd), dy = Math.sin(j.hd), rx = -dy, ry = dx;
    ctx.fillStyle = '#ffd93b';
    for (let i = 0; i < (j.armor || 2); i++) {
      for (const g of [1, -1]) {
        const f = 0.0 - i * 0.12, r = g * (0.2 + i * 0.05);
        const [sx, sy] = proj(j.x + f * dx + r * rx, j.y + f * dy + r * ry, j.z + 0.01);
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.6, CELL * 0.035), 0, TAU); ctx.fill();
      }
    }
  }
  // engine glow
  for (const tl of polys.tails) {
    const [tx, ty] = proj(tl[0], tl[1], tl[2]);
    const gr = CELL * CAM.zoom * (polys.tails.length > 1 ? 0.13 : 0.19), gl = ctx.createRadialGradient(tx, ty, 0, tx, ty, gr);
    const hot = j.type === 'player' ? ['rgba(235,250,255,0.95)', 'rgba(110,190,255,0.5)', 'rgba(60,120,255,0)'] : ['rgba(255,245,200,0.95)', 'rgba(255,150,60,0.55)', 'rgba(255,70,20,0)'];
    gl.addColorStop(0, hot[0]); gl.addColorStop(0.35, hot[1]); gl.addColorStop(1, hot[2]);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(tx, ty, gr, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}
// a darker copy of the plane laid on the sea
function drawJetShadow(j) {
  const sp = JET[j.type];
  const off = j.z;
  const polys = jetPolys(sp, j.x + off * 0.26, j.y + off * 0.38, 0, j.hd, 0, j.roll ? Math.min(0.5, Math.abs(j.roll)) : 0);
  ctx.fillStyle = `rgba(8,30,66,${j.z > 2.6 ? 0.18 : 0.28})`;
  for (const q of polys) {
    if (q.fin) continue;
    ctx.beginPath();
    q.p.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.closePath();
    ctx.fill();
  }
}
function miniJet(x, y, r, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x - r * 0.7, y - r * 0.8);
  ctx.lineTo(x - r * 0.35, y);
  ctx.lineTo(x - r * 0.7, y + r * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}
let drawClock = 0;
function turnTo(cur, target, k) {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * k;
}
function enemyPosAt(e, t) {
  if (t <= e.mt0) return [e.fx, e.fy];
  if (t >= e.mt1) return [e.x, e.y];
  const k = (t - e.mt0) / (e.mt1 - e.mt0);
  const s = k * k * (3 - 2 * k);
  return [e.fx + (e.x - e.fx) * s, e.fy + (e.y - e.fy) * s];
}
const enemyPos = e => enemyPosAt(e, G.clock);
function playerPos(at) {
  const P = G.player;
  const t = at == null ? G.clock : at;
  if (G.path && G.tl && t < G.tl.pathEnd) {
    const f = Math.max(0, (t - G.tl.t0) / G.tl.step);
    const i = Math.min(G.path.length - 1, Math.floor(f));
    const j = Math.min(G.path.length - 1, i + 1);
    const k = f - i;
    return [G.path[i].x + (G.path[j].x - G.path[i].x) * k, G.path[i].y + (G.path[j].y - G.path[i].y) * k];
  }
  return [P.x, P.y];
}
const pilot = { hd: -Math.PI / 2, roll: 0, pitch: 0 };
// altitude over the turn: a gentle arc, plus whatever the manoeuvres add
function flightZ(now) {
  const tl = G.tl;
  if (!tl || now < tl.t0 || now > tl.pathEnd) return playerAlt;
  const f = (now - tl.t0) / Math.max(0.05, tl.pathEnd - tl.t0);
  return playerAlt + 0.35 * Math.sin(Math.PI * f);
}
// how the player's plane is turned and where it is at a moment: the Immelmann turns live here
function playerPose(now, dtc) {
  const [px, py] = playerPos(now);
  let x = px + 0.5, y = py + 0.5, z = flightZ(now), hd = pilot.hd, pitch = 0, roll = 0, manoeuvre = false;
  for (const m of G.maneuvers) {
    const u0 = m.tb - m.w, u1 = m.tb + m.w, u2 = u1 + 2.4 * m.w;
    if (now >= u0 && now <= u1) {
      // half a loop: nose up, over the top
      const u = (now - u0) / (2 * m.w);
      hd = m.h0; pitch = Math.PI * u;
      z += 0.62 * (1 - Math.cos(Math.PI * u));
      if (m.crash) { x += Math.cos(m.h0) * 0.55 * Math.sin(Math.PI * u); y += Math.sin(m.h0) * 0.55 * Math.sin(Math.PI * u); }
      manoeuvre = true;
    } else if (now > u1 && now <= u2) {
      // inverted, heading back: roll upright and settle down
      const v = (now - u1) / (2.4 * m.w);
      hd = m.h0 + Math.PI; pitch = 0;
      const r = clamp(v / 0.75, 0, 1);
      roll = Math.PI * (1 - r * r * (3 - 2 * r));
      z += 1.24 * (1 - v * v * (3 - 2 * v));
      if (m.crash) { x += Math.cos(m.h0) * 0.0; }
      manoeuvre = true;
    }
    if (manoeuvre) { pilot.hd = hd; break; }
  }
  if (!manoeuvre) {
    const [qx, qy] = playerPos(now - 0.03);
    const moving = G.tl && now < G.tl.pathEnd && now > G.tl.t0 && Math.hypot(px - qx, py - qy) > 0.002;
    const P = G.player;
    let target = null;
    if (moving) target = Math.atan2(py - qy, px - qx);
    else if (P.vx || P.vy) target = Math.atan2(P.vy, P.vx);
    if (target != null) {
      const before = pilot.hd;
      pilot.hd = turnTo(pilot.hd, target, Math.min(1, dtc * 12));
      const rate = Math.atan2(Math.sin(pilot.hd - before), Math.cos(pilot.hd - before)) / Math.max(dtc, 0.001);
      pilot.roll += (clamp(rate * 0.2, -1.0, 1.0) - pilot.roll) * Math.min(1, dtc * 10);
    } else pilot.roll += (0 - pilot.roll) * Math.min(1, dtc * 8);
    hd = pilot.hd; roll = pilot.roll;
  }
  return { x, y, z, hd, pitch, roll };
}

// where the player's plane was, for the vapour trail (no side effects)
function trailPoint(t) {
  const [px, py] = playerPos(t);
  let x = px + 0.5, y = py + 0.5, z = flightZ(t);
  for (const m of G.maneuvers) {
    const u0 = m.tb - m.w, u1 = m.tb + m.w, u2 = u1 + 2.4 * m.w;
    if (t >= u0 && t <= u1) {
      const u = (t - u0) / (2 * m.w);
      z += 0.62 * (1 - Math.cos(Math.PI * u));
      if (m.crash) { x += Math.cos(m.h0) * 0.55 * Math.sin(Math.PI * u); y += Math.sin(m.h0) * 0.55 * Math.sin(Math.PI * u); }
    } else if (t > u1 && t <= u2) {
      const v = (t - u1) / (2.4 * m.w);
      z += 1.24 * (1 - v * v * (3 - 2 * v));
    }
  }
  return [x, y, z];
}

// ---------------------------------------------------------------- terrain
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// neighbouring islands rise and fall together, like hills
function wallHeight(x, y) { return 0.55 + 1.35 * Math.pow(vnoise(x * 0.62 + 3.1, y * 0.62 + 7.7), 1.15); }
const isWall = (x, y) => inB(x, y) && cellType(x, y) === 1;
function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mixc(a, b, t) { const A = rgb(a), B = typeof b === 'string' ? rgb(b) : b; return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }
// each island cell is four rock pillars of different heights, so the coast reads as craggy stone
const pillarH = (i, j) => wallHeight(i >> 1, j >> 1) * (0.4 + 0.75 * Math.pow(hash2(i * 7 + 3, j * 5 + 1), 1.3));
const isWallSub = (i, j) => isWall(i >> 1, j >> 1);
function drawPillar(i, j) {
  const W = 0.5, x = i * W, y = j * W;
  const cx = i >> 1, cy = j >> 1;
  const h = pillarH(i, j);
  const hv = hash2(cx * 7 + 1, cy * 5 + 9);
  const hi = clamp((wallHeight(cx, cy) - 0.55) / 1.35, 0, 1);
  const topA = mixc('#8aa24a', '#a3a98a', hi * 0.7);
  const topB = mixc('#65823a', '#7d8466', hi * 0.7);
  const sides = [
    [[x, y + W], [x + W, y + W], '#9d9a96', 0, 1],
    [[x + W, y + W], [x + W, y], '#76726f', 1, 0],
    [[x + W, y], [x, y], '#625f5e', 0, -1],
    [[x, y], [x, y + W], '#86827d', -1, 0],
  ];
  for (let si = 0; si < 4; si++) {
    const [a, b, col, nx, ny] = sides[si];
    const nh = isWallSub(i + nx, j + ny) ? pillarH(i + nx, j + ny) : 0;
    if (nh >= h) continue;
    const Ba = proj(a[0], a[1], nh), Bb = proj(b[0], b[1], nh), Tb = proj(b[0], b[1], h), Ta = proj(a[0], a[1], h);
    const quad = [Ba, Bb, Tb, Ta];
    if (area(quad) >= -0.5) continue;
    const mx = (Ta[0] + Tb[0]) / 2, my = (Ta[1] + Tb[1]) / 2, bx = (Ba[0] + Bb[0]) / 2, by = (Ba[1] + Bb[1]) / 2;
    const gr = ctx.createLinearGradient(mx, my, bx, by);
    gr.addColorStop(0, mixc(col, '#ffffff', 0.2));
    gr.addColorStop(0.5, col);
    gr.addColorStop(1, mixc(col, '#2c3a4a', nh ? 0.25 : 0.5));
    const P = (u, v) => { const tx = Ta[0] + (Tb[0] - Ta[0]) * u, ty = Ta[1] + (Tb[1] - Ta[1]) * u; return [tx + ((Ba[0] + (Bb[0] - Ba[0]) * u) - tx) * v, ty + ((Ba[1] + (Bb[1] - Ba[1]) * u) - ty) * v]; };
    // the stone itself: a tiled photograph of basalt laid along the face, then lit by the sun
    const down = proj(a[0], a[1], h - 1), exv = [(Tb[0] - Ta[0]) * 2 / 256, (Tb[1] - Ta[1]) * 2 / 256], eyv = [(down[0] - Ta[0]) / 256, (down[1] - Ta[1]) / 256];
    const oo = 256 * hash2(i * 3 + si, j * 11);
    if (TEX.rockPat) {
      patFill(TEX.rockPat, [Ta[0] - exv[0] * oo, Ta[1] - exv[1] * oo], exv, eyv);
      poly(quad);
      ctx.fill();
      const dark = [0.0, 0.2, 0.36, 0.1][si];
      const ov = ctx.createLinearGradient(mx, my, bx, by);
      ov.addColorStop(0, `rgba(255,248,230,${0.16 - dark * 0.3})`);
      ov.addColorStop(0.35, `rgba(0,0,0,${dark})`);
      ov.addColorStop(1, `rgba(6,14,26,${Math.min(0.85, dark + (nh ? 0.2 : 0.45))})`);
      ctx.fillStyle = ov;
      poly(quad);
      ctx.fill();
    } else {
      ctx.fillStyle = gr;
      poly(quad);
      ctx.fill();
    }
    ctx.save();
    poly(quad);
    ctx.clip();
    // moss clinging near the top
    if (TEX.mossPat) patFill(TEX.mossPat, Ta, exv, eyv); else ctx.fillStyle = '#6f8a34';
    ctx.beginPath();
    ctx.moveTo(Ta[0], Ta[1]); ctx.lineTo(Tb[0], Tb[1]);
    for (let k = 6; k >= 0; k--) { const q = P(k / 6, 0.03 + 0.2 * hash2(i * 13 + k, j * 7 + si) * (0.5 + hi)); ctx.lineTo(q[0], q[1]); }
    ctx.closePath(); ctx.fill();
    // surf where the rock meets the water
    if (!nh) {
      const f0 = P(0, 0.88), f1 = P(1, 0.88);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      poly([Ba, Bb, f1, f0]);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(35,26,22,0.4)';
    ctx.lineWidth = 1;
    poly(quad);
    ctx.stroke();
  }
  const T = [proj(x, y, h), proj(x + W, y, h), proj(x + W, y + W, h), proj(x, y + W, h)];
  // from straight above the cliff face is hinted by a dark lip on the far edges
  const flat = 1 - CAM.t;
  if (flat > 0.02) {
    const dx = 0.035 * h * flat, dy = 0.05 * h * flat;
    ctx.fillStyle = 'rgba(55,45,38,0.9)';
    if (!isWallSub(i, j + 1) || pillarH(i, j + 1) < h) { poly([proj(x, y + W, h), proj(x + W, y + W, h), proj(x + W + dx, y + W + dy, h), proj(x + dx, y + W + dy, h)]); ctx.fill(); }
    if (!isWallSub(i + 1, j) || pillarH(i + 1, j) < h) { poly([proj(x + W, y, h), proj(x + W + dx, y + dy, h), proj(x + W + dx, y + W + dy, h), proj(x + W, y + W, h)]); ctx.fill(); }
  }
  if (TEX.mossPat) {
    const ex2 = [(proj(x + 1, y, h)[0] - T[0][0]) / 256, (proj(x + 1, y, h)[1] - T[0][1]) / 256], ey2 = [(proj(x, y + 1, h)[0] - T[0][0]) / 256, (proj(x, y + 1, h)[1] - T[0][1]) / 256];
    const o1 = 256 * hash2(i * 5, j * 9), o2 = 256 * hash2(i * 9, j * 5);
    patFill(TEX.mossPat, [T[0][0] - ex2[0] * o1 - ey2[0] * o2, T[0][1] - ex2[1] * o1 - ey2[1] * o2], ex2, ey2);
    poly(T);
    ctx.fill();
    const sh = ctx.createLinearGradient(T[0][0], T[0][1], T[2][0], T[2][1]);
    sh.addColorStop(0, `rgba(255,250,200,${0.08 + 0.1 * hi})`); sh.addColorStop(1, 'rgba(10,30,10,0.22)');
    ctx.fillStyle = sh;
    poly(T);
    ctx.fill();
  } else {
    const tg = ctx.createLinearGradient(T[0][0], T[0][1], T[2][0], T[2][1]);
    tg.addColorStop(0, topA); tg.addColorStop(1, topB);
    ctx.fillStyle = tg;
    poly(T);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,210,0.32)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(T[3][0], T[3][1]); ctx.lineTo(T[0][0], T[0][1]); ctx.lineTo(T[1][0], T[1][1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,60,25,0.4)';
  ctx.lineWidth = 1;
  poly(T);
  ctx.stroke();
  // moss and scrub on top
  if (!TEX.mossPat) for (let k = 0; k < 3; k++) {
    const [px, py] = proj(x + W * (0.2 + 0.6 * hash2(i + k * 5, j * 3 + 1)), y + W * (0.2 + 0.6 * hash2(i * 3 + 2, j + k * 7)), h);
    ctx.fillStyle = k % 2 ? 'rgba(40,84,28,0.35)' : 'rgba(205,230,120,0.3)';
    ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, CELL * (0.04 + 0.03 * hash2(k, i + j)) * CAM.zoom), 0, TAU); ctx.fill();
  }
  // a pine on some of the lower ground
  if (hash2(i * 3 + 5, j * 7 + 2) > 0.74 && hi < 0.6) {
    const [px, py] = proj(x + W / 2, y + W / 2, h);
    const hgt = CELL * 0.6 * (0.3 + 0.7 * CAM.t) * CAM.zoom, wd = CELL * 0.15 * CAM.zoom;
    if (CAM.t < 0.15) { ctx.fillStyle = '#2f5f2a'; ctx.beginPath(); ctx.arc(px, py, wd * 0.9, 0, TAU); ctx.fill(); }
    else if (TEX.pine) {
      ctx.globalAlpha = Math.min(1, CAM.t * 1.5);
      ctx.fillStyle = 'rgba(10,30,10,0.3)';
      ctx.beginPath(); ctx.ellipse(px + wd * 0.9, py + 1, wd * 1.6, wd * 0.5, 0, 0, TAU); ctx.fill();
      const ph = hgt * 1.55, pw = ph * 0.6;
      ctx.drawImage(TEX.pine, px - pw / 2, py - ph + ph * 0.1, pw, ph);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = Math.min(1, CAM.t * 1.5);
      ctx.fillStyle = '#6b4a2e';
      ctx.fillRect(px - 1.2, py - hgt * 0.2, 2.4, hgt * 0.2);
      for (let L = 0; L < 3; L++) {
        const yb = py - hgt * (0.12 + 0.28 * L), yt = py - hgt * (0.55 + 0.22 * L), w = wd * (1.35 - 0.3 * L);
        ctx.fillStyle = mixc('#2c6a30', '#58a04a', L / 2.5);
        ctx.beginPath(); ctx.moveTo(px, yt - hgt * 0.1); ctx.lineTo(px + w, yb); ctx.lineTo(px - w, yb); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,30,10,0.28)';
        ctx.beginPath(); ctx.moveTo(px, yt - hgt * 0.1); ctx.lineTo(px + w, yb); ctx.lineTo(px, yb); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}
// a column of swirling air that throws a plane back
function drawVortex(x, y, now) {
  const bt = G.bumpT.get(y * N + x);
  const glow = bt != null && now >= bt && now - bt < 0.5 ? 1 - (now - bt) / 0.5 : 0;
  const cx = x + 0.5, cy = y + 0.5, H = 1.1;
  const rBase = CELL * 0.26 * CAM.zoom, rTop = CELL * 0.4 * CAM.zoom;
  const [bx, by] = proj(cx, cy, 0.04), [tx, ty] = proj(cx, cy, H);
  // the column
  ctx.fillStyle = `rgba(150,230,255,${0.2 + 0.25 * glow})`;
  ctx.beginPath();
  ctx.moveTo(bx - rBase, by);
  ctx.lineTo(tx - rTop, ty);
  ctx.ellipse(tx, ty, rTop, rTop * CAM.sinP, 0, Math.PI, 0, true);
  ctx.lineTo(bx + rBase, by);
  ctx.ellipse(bx, by, rBase, rBase * CAM.sinP, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgba(215,248,255,${0.55 + 0.4 * glow})`;
  ctx.lineWidth = 1.6 + glow * 2;
  ctx.beginPath(); ctx.ellipse(bx, by, rBase, rBase * CAM.sinP, 0, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(tx, ty, rTop, rTop * CAM.sinP, 0, 0, TAU); ctx.stroke();
  // two streams winding up it
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * glow})`;
  for (let j = 0; j < 2; j++) {
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, ang = now * 3.2 + j * Math.PI + u * 6.5, rr = (0.2 + 0.14 * u);
      const [px, py] = proj(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 0.04 + u * (H - 0.04));
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
}
// the edge of the board throws planes back when the walls are up
function windWall(a, b, now) {
  const H = 1.2;
  const quad = [proj(a[0], a[1], 0), proj(b[0], b[1], 0), proj(b[0], b[1], H), proj(a[0], a[1], H)];
  const gr = ctx.createLinearGradient(0, quad[3][1], 0, quad[0][1]);
  gr.addColorStop(0, 'rgba(180,240,255,0.04)');
  gr.addColorStop(1, 'rgba(120,225,255,0.3)');
  ctx.fillStyle = gr;
  poly(quad);
  ctx.fill();
  ctx.strokeStyle = `rgba(210,248,255,${0.6 + 0.25 * Math.sin(now * 2.6)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(quad[3][0], quad[3][1]); ctx.lineTo(quad[2][0], quad[2][1]);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210,248,255,0.28)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const u = ((i / 6) + now * 0.15) % 1;
    const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    const bb = proj(p[0], p[1], 0), tt = proj(p[0], p[1], H);
    ctx.beginPath(); ctx.moveTo(bb[0], bb[1]); ctx.lineTo(tt[0], tt[1]); ctx.stroke();
  }
}

function drawMarks(cells, type, a, aim) {
  const color = TYPES[type].color;
  ctx.fillStyle = color;
  if (type === 'lancer') {
    // a line of fire
    for (const [x, y] of cells) {
      ctx.globalAlpha = 0.16 * a;
      ctx.fillRect(X(x) + 2, Y(y) + 2, CELL - 4, CELL - 4);
    }
    if (cells.length) {
      const [x0, y0] = cells[0], [x1, y1] = cells[cells.length - 1];
      const dx = aim ? aim[0] : sign(x1 - x0), dy = aim ? aim[1] : sign(y1 - y0);
      ctx.globalAlpha = 0.85 * a;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, CELL * 0.07);
      ctx.beginPath();
      ctx.moveTo(CX(x0) - dx * CELL * 0.5, CY(y0) - dy * CELL * 0.5);
      ctx.lineTo(CX(x1) + dx * CELL * 0.35, CY(y1) + dy * CELL * 0.35);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (type === 'mortar') {
    // a crosshair on each cell
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, CELL * 0.045);
    for (const [x, y] of cells) {
      ctx.globalAlpha = 0.2 * a;
      ctx.fillRect(X(x) + 2, Y(y) + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 0.85 * a;
      const cx = CX(x), cy = CY(y), r = CELL * 0.24;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.moveTo(cx - r * 1.5, cy); ctx.lineTo(cx - r * 0.5, cy);
      ctx.moveTo(cx + r * 0.5, cy); ctx.lineTo(cx + r * 1.5, cy);
      ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx, cy - r * 0.5);
      ctx.moveTo(cx, cy + r * 0.5); ctx.lineTo(cx, cy + r * 1.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  for (const [x, y] of cells) {
    ctx.globalAlpha = 0.2 * a;
    ctx.fillRect(X(x) + 2, Y(y) + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 0.75 * a;
    const s = CELL * 0.14;
    // corner ticks
    ctx.fillRect(X(x) + 3, Y(y) + 3, s, 2); ctx.fillRect(X(x) + 3, Y(y) + 3, 2, s);
    ctx.fillRect(X(x + 1) - 3 - s, Y(y) + 3, s, 2); ctx.fillRect(X(x + 1) - 5, Y(y) + 3, 2, s);
    ctx.fillRect(X(x) + 3, Y(y + 1) - 5, s, 2); ctx.fillRect(X(x) + 3, Y(y + 1) - 3 - s, 2, s);
    ctx.fillRect(X(x + 1) - 3 - s, Y(y + 1) - 5, s, 2); ctx.fillRect(X(x + 1) - 5, Y(y + 1) - 3 - s, 2, s);
  }
  ctx.globalAlpha = 1;
}

// the sea, the shallows, the grid and the islands' shadows never change within an area: draw them once
let seaCache = null;
function seaImage() {
  const key = G.arenaId + '|' + CELL + '|' + DPR;
  if (seaCache && seaCache.key === key) return seaCache.c;
  const W = Math.min(Math.round(CELL * N * DPR), 760);
  const c = document.createElement('canvas');
  c.width = W; c.height = W;
  const land = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (G.grid[y * N + x] === 1) land.push([x, y]);
  const finish = g => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const k = W / N;                       // pixels per cell
    // surf speckle and pebbles around the islands
    for (const [lx, ly] of land) {
      for (let q = 0; q < 16; q++) {
        const a = hash2(lx * 31 + q, ly * 17) * TAU, r = 0.64 + 0.5 * hash2(lx + q * 3, ly * 5 + 1);
        const px = lx + 0.5 + Math.cos(a) * r, py = ly + 0.5 + Math.sin(a) * r;
        if (!inB(Math.floor(px), Math.floor(py)) || G.grid[Math.floor(py) * N + Math.floor(px)] === 1) continue;
        if (q % 4 === 0) {
          const rw = k * (0.03 + 0.03 * hash2(q, lx)), rh = rw * 0.7;
          g.fillStyle = 'rgba(40,38,38,0.35)'; g.beginPath(); g.ellipse(px * k + rw * 0.4, py * k + rh * 0.6, rw, rh, 0, 0, TAU); g.fill();
          const gr = g.createRadialGradient(px * k - rw * 0.3, py * k - rh * 0.4, 0, px * k, py * k, rw * 1.2);
          gr.addColorStop(0, '#c8c2b8'); gr.addColorStop(1, '#6e6a66');
          g.fillStyle = gr; g.beginPath(); g.ellipse(px * k, py * k, rw, rh, 0, 0, TAU); g.fill();
        } else { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(px * k, py * k, k * 0.016, 0, TAU); g.fill(); }
      }
    }
    // the board's grid, a faint etched line under the water
    g.strokeStyle = 'rgba(200,236,255,0.3)';
    g.lineWidth = Math.max(1, k * 0.018);
    g.beginPath();
    for (let i = 0; i <= N; i++) { g.moveTo(i * k, 0); g.lineTo(i * k, W); g.moveTo(0, i * k); g.lineTo(W, i * k); }
    g.stroke();
    // each island throws a soft shadow across the water
    for (let pass = 0; pass < 4; pass++) {
      g.fillStyle = `rgba(6,28,60,${0.075 - pass * 0.012})`;
      for (const [x, y] of land) {
        const h = wallHeight(x, y), q = 0.5 + pass * 0.2;
        g.fillRect((x + h * 0.4 * q) * k, (y + h * 0.32 * q) * k, k, k);
      }
    }
  };
  if (window.KanseiArt) window.KanseiArt.sea(c, land, N, finish);
  else { const g = c.getContext('2d'); g.fillStyle = ART.seaBase; g.fillRect(0, 0, W, W); finish(g); }
  seaCache = { key, c };
  return c;
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!G.player) { ctx.fillStyle = '#8fc9f3'; ctx.fillRect(0, 0, VW, VH); return; }
  const now = G.clock;
  const dtc = Math.min(0.1, Math.max(0, now - drawClock));
  drawClock = now;
  updateCam(now);
  drawRoom();
  drawSlab();
  drawCubeBack(now);

  const P = G.player;
  const playing = !G.over || now < G.overT - 0.4;

  // ---- who is where
  const jets = [];
  for (const e of G.enemies) {
    if (now < e.bornT) continue;
    const [x, y] = enemyPos(e);
    const [px, py] = enemyPosAt(e, now - 0.04);
    const moved = Math.hypot(x - px, y - py) > 0.004;
    let target;
    if (moved) target = Math.atan2(y - py, x - px);
    else if (e.type === 'lancer' && e.aim) target = Math.atan2(e.aim[1], e.aim[0]);
    else target = Math.atan2(P.y - y, P.x - x);
    const before = e.hd == null ? target : e.hd;
    e.hd = e.hd == null ? target : turnTo(e.hd, target, Math.min(1, dtc * 10));
    const rate = Math.atan2(Math.sin(e.hd - before), Math.cos(e.hd - before)) / Math.max(dtc, 0.001);
    e.roll = (e.roll || 0) + (clamp(rate * 0.18, -0.9, 0.9) - (e.roll || 0)) * Math.min(1, dtc * 8);
    jets.push({ type: e.type, x: x + 0.5, y: y + 0.5, z: enemyAlt(e.id) + 0.06 * Math.sin(now * 2 + e.id), hd: e.hd, roll: e.roll, pitch: 0, armor: e.armor, e, moved, fromX: px + 0.5, fromY: py + 0.5 });
  }
  for (const c of G.corpses) {
    if (now < c.t) {
      jets.push({ type: c.type, x: c.x + 0.5, y: c.y + 0.5, z: enemyAlt(c.id || 0), hd: c.hd == null ? 0 : c.hd, armor: c.armor, pitch: 0, roll: 0 });
    } else if (now < c.t + c.fall) {
      // shot down: it rolls, drops its nose, and falls trailing fire
      const u = (now - c.t) / c.fall;
      const [fx, fy, fz] = fallPos(c.x + 0.5, c.y + 0.5, enemyAlt(c.id || 0), c.lx, c.ly, u);
      jets.push({ type: c.type, x: fx, y: fy, z: fz, hd: (c.hd || 0) + c.spin * u * u * 0.25, pitch: -0.2 - 0.9 * Math.min(1, u * 1.6), roll: c.spin * u * 1.4, armor: c.armor, falling: true });
    }
  }
  let pj = null;
  if (playing) {
    pj = Object.assign({ type: 'player' }, playerPose(now, dtc));
    jets.push(pj);
  }

  // ---- the sea and everything lying on it
  groundOn();
  // nearest-neighbour keeps the tilted blit cheap on slow machines; the sea is flat colour, so it costs little in looks
  ctx.imageSmoothingEnabled = true;
  {
    // only the part of the sea that is on screen
    const img = seaImage(), M = ctx.getTransform(), det = M.a * M.d - M.b * M.c;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [sx, sy] of [[0, 0], [VW, 0], [VW, VH], [0, VH]]) {
      const px = sx * DPR - M.e, py = sy * DPR - M.f;
      const gx = (M.d * px - M.c * py) / det, gy = (-M.b * px + M.a * py) / det;
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
    }
    x0 = clamp(Math.floor(x0 - 2), OX, OX + CELL * N); x1 = clamp(Math.ceil(x1 + 2), OX, OX + CELL * N);
    y0 = clamp(Math.floor(y0 - 2), OY, OY + CELL * N); y1 = clamp(Math.ceil(y1 + 2), OY, OY + CELL * N);
    const SS = img.width / (CELL * N);
    if (x1 > x0 && y1 > y0) ctx.drawImage(img, (x0 - OX) * SS, (y0 - OY) * SS, (x1 - x0) * SS, (y1 - y0) * SS, x0, y0, x1 - x0, y1 - y0);
  }
  ctx.imageSmoothingEnabled = true;
  // light moving on the water
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const wx = ((hash2(i, 11) + now * (0.012 + 0.01 * hash2(i, 12))) % 1) * N, wy = hash2(i, 13) * N;
    ctx.moveTo(X(wx), Y(wy)); ctx.lineTo(X(wx + 0.35), Y(wy));
  }
  ctx.stroke();
  // the board's edge, when it throws planes back
  if (G.edgeBounce) {
    ctx.strokeStyle = `rgba(150,238,255,${0.55 + 0.25 * Math.sin(now * 2.6)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(OX, OY, CELL * N, CELL * N);
  }
  // where the last move went
  if (G.lastPath) {
    const al = G.tl ? 0.24 : 0.17 * Math.max(0, 1 - (now - (G.lastPath.endT || 0)) / 1.8);
    if (al > 0.004) {
      ctx.fillStyle = ART.yellow;
      ctx.globalAlpha = al;
      for (const [x, y] of G.lastPath.cells) ctx.fillRect(X(x) + 2, Y(y) + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 1;
    }
  }
  // shadows of the aircraft
  for (const j of jets) drawJetShadow(j);

  // threat marks: old ones while the move plays out, current ones otherwise
  const showNew = !G.tl || now >= G.tl.end;
  if (!showNew) {
    for (const m of G.oldMarks) {
      const da = G.deadAt.get(m.id);
      if (da != null && now >= da) continue;
      if (now >= G.tl.enemyT) continue;
      drawMarks(m.cells, m.type, 1, m.aim);
    }
  } else if (!G.over) {
    const pulse = 0.8 + 0.2 * Math.sin(now * 5);
    const ks = G.hover ? G.hover.killSet : null;
    for (const e of G.enemies) {
      if (!e.marks.length) continue;
      const cancelled = ks && ks.has(e);
      drawMarks(e.marks, e.type, cancelled ? 0.18 : pulse, e.aim);
    }
  }
  for (const f of G.flashes) {
    const k = (now - f.t) / 0.35;
    if (k < 0 || k > 1) continue;
    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.6 * (1 - k);
    for (const [x, y] of f.cells) ctx.fillRect(X(x) + 1, Y(y) + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 1;
  }
  for (const r of G.rings) {
    const k = (now - r.t) / r.life;
    if (k < 0 || k > 1) continue;
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 0.85 * (1 - k);
    ctx.lineWidth = 2.5 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(X(r.x), Y(r.y), CELL * r.r * (0.2 + 0.8 * Math.sqrt(k)), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // incoming
  for (const s of G.spawns) {
    if (now < s.t) continue;
    ctx.strokeStyle = TYPES[s.type].color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -now * 20;
    ctx.beginPath();
    ctx.arc(CX(s.x), CY(s.y), CELL * 0.3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // move options
  const [ppx, ppy] = playerPos();
  if (showNew && !G.over && !G.pendingClear) {
    // where momentum alone would carry you
    const cxv = P.x + P.vx, cyv = P.y + P.vy;
    if (P.vx || P.vy) {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CX(P.x), CY(P.y));
      ctx.lineTo(CX(cxv), CY(cyv));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const act = G.selected || G.hover;
    if (act) drawPreview(act);
    for (const o of G.markers) {
      const isAct = act && act.ex === o.ex && act.ey === o.ey;
      const cx = CX(o.ex), cy = CY(o.ey);
      const r = CELL * (isAct ? 0.2 : 0.14);
      const col = o.danger ? ART.red : ART.cyan;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = isAct ? 1 : 0.9;
      const stops = !!(o.crash || o.clank);
      // a dark backing so the marker stays readable on top of any threat mark
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = '#0b2a4f';
      ctx.beginPath();
      ctx.arc(cx, cy, (o.ex === P.x && o.ey === P.y ? CELL * 0.42 : r) + 4, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      if (o.ex === P.x && o.ey === P.y) ctx.arc(cx, cy, CELL * 0.42, 0, TAU);
      else if (stops) ctx.rect(cx - r, cy - r, r * 2, r * 2);
      else ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      if (o.bounces.length && (o.vx || o.vy)) {
        // momentum after the bounce
        const L = Math.hypot(o.vx, o.vy), ux = o.vx / L, uy = o.vy / L;
        const a0 = r + 2, a1 = r + CELL * 0.26, h = CELL * 0.09;
        ctx.beginPath();
        ctx.moveTo(cx + ux * a0, cy + uy * a0);
        ctx.lineTo(cx + ux * a1, cy + uy * a1);
        ctx.moveTo(cx + ux * a1 - ux * h - uy * h, cy + uy * a1 - uy * h + ux * h);
        ctx.lineTo(cx + ux * a1, cy + uy * a1);
        ctx.lineTo(cx + ux * a1 - ux * h + uy * h, cy + uy * a1 - uy * h - ux * h);
        ctx.stroke();
      }
      if (o.kills.length && !(o.ex === P.x && o.ey === P.y)) {
        ctx.fillStyle = ART.yellow;
        for (let i = 0; i < o.kills.length; i++) {
          const a = -Math.PI / 2 + (i - (o.kills.length - 1) / 2) * 0.6;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5), 2.4, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  // a gun-sight on the ground under the player while flying
  if (pj && CAM.t > 0.05) {
    ctx.strokeStyle = ART.yellow;
    ctx.globalAlpha = 0.9 * CAM.t;
    ctx.lineWidth = 2;
    const gx = CX(ppx), gy = CY(ppy), q = CELL * 0.38, l = CELL * 0.14;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(gx + sx * q, gy + sy * (q - l)); ctx.lineTo(gx + sx * q, gy + sy * q); ctx.lineTo(gx + sx * (q - l), gy + sy * q);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  groundOff();

  // ---- things with height, back to front
  const objs = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = G.grid[y * N + x];
      if (t === 1) for (let q = 0; q < 4; q++) { const pi = x * 2 + (q & 1), pj = y * 2 + (q >> 1); objs.push({ d: depthOf((pi + 0.5) / 2, (pj + 0.5) / 2) - 0.3, f: () => drawPillar(pi, pj) }); }
      else if (t === 2) objs.push({ d: depthOf(x + 0.5, y + 0.5), f: () => drawVortex(x, y, now) });
    }
  }
  if (G.edgeBounce) {
    const walls = [[[0, 0], [N, 0]], [[N, 0], [N, N]], [[N, N], [0, N]], [[0, N], [0, 0]]];
    for (const [a, b] of walls) objs.push({ d: depthOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), f: () => windWall(a, b, now), wall: true });
  }
  for (const j of jets) {
    objs.push({ d: depthOf(j.x, j.y) + CELL * 0.45, f: () => {
      // the line down to the sea, so height is readable from the side
      if (CAM.t > 0.1 && !j.falling) {
        const [ax, ay] = proj(j.x, j.y, j.z - 0.1), [bx, by] = proj(j.x, j.y, 0);
        ctx.strokeStyle = j.type === 'player' ? ART.yellow : ART.red;
        ctx.globalAlpha = 0.85 * CAM.t;
        ctx.lineWidth = 1.7;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      drawJet(j);
    } });
  }
  objs.sort((a, b) => a.d - b.d);
  // vapour trails: smooth tapering white ribbons behind every plane in flight
  const ribbon = (pts, w0, a0) => {
    if (TEX.trail) {
      for (let i = pts.length - 1; i >= 1; i--) {
        const f = 1 - i / pts.length, r = w0 * (0.9 + 1.6 * (1 - f));
        ctx.globalAlpha = a0 * Math.pow(f, 0.9) * 0.8;
        ctx.drawImage(TEX.trail, pts[i][0] - r, pts[i][1] - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const f = 1 - i / pts.length;
      ctx.globalAlpha = a0 * Math.pow(f, 1.2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, w0 * (0.25 + 0.75 * f));
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  };
  if (G.tl && now > G.tl.t0 && now < G.tl.pathEnd + 1.2 && playing) {
    const sp = 0.028 * Math.max(1, Math.pow(G.tl.k, 0.7));
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const tt = Math.min(now - i * sp, G.tl.pathEnd + 0.02);
      if (tt < G.tl.t0) break;
      const [tx, ty, tz] = trailPoint(tt);
      pts.push(proj(tx, ty, tz));
    }
    if (pts.length > 1) ribbon(pts, CELL * CAM.zoom * 0.26, 0.95);
  }
  for (const j of jets) {
    if (!j.e || !j.moved) continue;
    const pts = [];
    for (let i = 0; i <= 14; i++) { const [qx, qy] = enemyPosAt(j.e, now - i * 0.05); pts.push(proj(qx + 0.5, qy + 0.5, j.z)); }
    ribbon(pts, CELL * CAM.zoom * 0.15, 0.8);
  }
  for (const o of objs) o.f();
  drawCubeFront(now);

  // ---- cannon fire: tracers from the player's nose to the plane being shot down
  if (pj) {
    for (const g of G.guns) {
      if (now < g.t0 || now > g.t1) continue;
      const nose = [pj.x + Math.cos(pj.hd) * 0.55, pj.y + Math.sin(pj.hd) * 0.55, pj.z];
      const a = proj(nose[0], nose[1], nose[2]), b = proj(g.x, g.y, g.z);
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const u = ((now * 16 + i / 7) % 1), u2 = Math.min(1, u + 0.16);
        ctx.strokeStyle = i % 2 ? '#fff6c8' : '#ffd24a';
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.moveTo(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
        ctx.lineTo(a[0] + (b[0] - a[0]) * u2, a[1] + (b[1] - a[1]) * u2);
        ctx.stroke();
      }
      // muzzle flash
      const f = 0.7 + 0.3 * Math.sin(now * 90);
      ctx.fillStyle = '#fff3b0';
      ctx.globalAlpha = 0.9 * f;
      ctx.beginPath(); ctx.arc(a[0], a[1], CELL * CAM.zoom * 0.1 * f, 0, TAU); ctx.fill();
      // strikes along the target
      ctx.fillStyle = '#ffd24a';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(b[0] + (Math.random() - 0.5) * 8, b[1] + (Math.random() - 0.5) * 8, CELL * CAM.zoom * 0.06, 0, TAU); ctx.fill();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    }
  }

  // ---- explosions, smoke, wreckage (smoke under fire, sparks on top)
  const PRIO = { smoke: 0, spray: 0, fire: 1, debris: 2, spark: 3 };
  const parts = G.particles.filter(p => now >= p.t && now <= p.t + p.life).sort((a, b) => PRIO[a.kind] - PRIO[b.kind]);
  for (const p of parts) {
    const k = now - p.t;
    if (k < 0 || k > p.life) continue;
    const u = k / p.life;
    const x = p.x + p.vx * k, y = p.y + p.vy * k;
    const z = p.z + p.vz * k - (p.kind === 'debris' ? 3.4 * k * k : p.kind === 'spark' ? 2 * k * k : 0);
    if (z < -0.05 && p.kind !== 'smoke') continue;
    const [sx, sy] = proj(x, y, Math.max(0, z));
    const R = CELL * CAM.zoom;
    if (p.kind === 'fire') {
      const r = R * p.size * (0.22 + 0.8 * Math.sqrt(u));
      ctx.globalAlpha = Math.pow(1 - u, 1.1);
      if (TEX.fire) {
        ctx.drawImage(TEX.fire, sx - r * 1.5, sy - r * 1.5, r * 3, r * 3);
        ctx.drawImage(TEX.fire, sx - r, sy - r, r * 2, r * 2);
        if (p.core) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.pow(1 - u, 0.8) * 0.8; ctx.drawImage(TEX.fire, sx - r * 0.8, sy - r * 0.8, r * 1.6, r * 1.6); ctx.globalCompositeOperation = 'source-over'; }
      } else {
        ctx.fillStyle = '#ff8a2a';
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd35a';
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.62, 0, TAU); ctx.fill();
        if (p.core) { ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(sx, sy, r * 0.32, 0, TAU); ctx.fill(); }
      }
    } else if (p.kind === 'smoke') {
      ctx.globalAlpha = 0.55 * (1 - u);
      const rs = R * p.size * (0.2 + 0.55 * u);
      if (TEX.smoke) { ctx.globalAlpha = 0.8 * (1 - u); ctx.drawImage(TEX.smoke, sx - rs * 1.3, sy - rs * 1.3, rs * 2.6, rs * 2.6); }
      else {
        const g = Math.round(70 + 60 * u);
        ctx.fillStyle = `rgb(${g},${g + 4},${g + 12})`;
        ctx.beginPath(); ctx.arc(sx, sy, rs, 0, TAU); ctx.fill();
      }
    } else if (p.kind === 'debris') {
      ctx.globalAlpha = 1 - u * u;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.rot + p.spin * k);
      ctx.fillStyle = p.color;
      const s0 = Math.max(2.5, R * 0.07 * p.size);
      ctx.fillRect(-s0, -s0 * 0.5, s0 * 2, s0);
      ctx.restore();
    } else if (p.kind === 'spark') {
      const [qx, qy] = proj(x - p.vx * 0.03, y - p.vy * 0.03, Math.max(0, z));
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(sx, sy); ctx.stroke();
    } else if (p.kind === 'spray') {
      ctx.globalAlpha = 0.7 * (1 - u);
      ctx.fillStyle = '#e8f6ff';
      ctx.beginPath(); ctx.ellipse(sx, sy - R * 0.2 * Math.sin(Math.PI * u), R * 0.22 * p.size, R * 0.1 * p.size, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // a wounded plane trails smoke
  if (pj && P.hp === 1 && Math.floor(now * 14) !== Math.floor((now - dtc) * 14)) {
    addP({ kind: 'smoke', x: pj.x, y: pj.y, z: pj.z - 0.05, vx: 0, vy: 0, vz: 0.25, t: now, life: 0.8, size: 0.5 });
  }

  // ---- score pops
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of G.popups) {
    const k = now - p.t;
    if (k < 0) continue;
    const [sx, sy] = proj(p.x + 0.5, p.y + 0.5, 1.5 + k * 0.9);
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.font = `800 ${Math.round(CELL * (p.big ? 0.5 : 0.38))}px ${SANS}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,36,70,0.85)';
    ctx.strokeText(p.text, sx, sy);
    ctx.fillStyle = p.big ? ART.yellow : '#ffffff';
    ctx.fillText(p.text, sx, sy);
  }
  ctx.globalAlpha = 1;

  if (CAM.t > 0.02) {
    const vg = ctx.createRadialGradient(VW / 2, VH * 0.52, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.52, Math.hypot(VW, VH) * 0.62);
    vg.addColorStop(0, 'rgba(8,24,52,0)'); vg.addColorStop(1, `rgba(8,24,52,${0.32 * CAM.t})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VW, VH);
  }
  drawHud();

  // hurt flash
  const hk = now - G.hurtT;
  if (hk >= 0 && hk < 0.5) {
    ctx.fillStyle = '#ff3b30';
    ctx.globalAlpha = 0.28 * (1 - hk / 0.5);
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  }

  // a new area: through the cloud
  const tk = now - G.transT;
  if (tk >= 0 && tk < 1.4) {
    const a = tk < 0.35 ? 1 : Math.max(0, 1 - (tk - 0.35) / 0.9);
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#dff0fc'); g.addColorStop(1, '#a9d4f4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = ART.navy;
    ctx.font = `800 ${Math.round(CELL * 1.25)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AREA ' + String(G.floor).padStart(2, '0'), VW / 2, VH / 2);
    // a contrail sweeping across
    const sx = -80 + (VW + 160) * clamp(tk / 1.1, 0, 1);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx - VW * 0.35, VH / 2 + CELL * 1.5); ctx.lineTo(sx, VH / 2 + CELL * 1.5); ctx.stroke();
    miniJet(sx + 12, VH / 2 + CELL * 1.5, CELL * 0.4, ART.navy, 1);
    ctx.globalAlpha = 1;
  }
  if (G.titleT > -1) {
    const k = now - G.titleT;
    if (k < 3.5) {
      ctx.globalAlpha = Math.max(0, k < 1.4 ? Math.min(1, k) : 1 - (k - 1.4) / 2.1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.round(Math.min(VW, VH) * 0.18);
      ctx.font = `800 ${fs}px ${SANS}`;
      ctx.lineWidth = Math.max(6, fs * 0.08);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ART.navy;
      ctx.strokeText('慣性', VW / 2, OY + CELL * 2.6);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('慣性', VW / 2, OY + CELL * 2.6);
      ctx.globalAlpha = 1;
    }
  }

  // game over
  if (G.over && now >= G.overT) {
    const a = Math.min(1, (now - G.overT) / 0.5);
    ctx.globalAlpha = a * 0.72;
    ctx.fillStyle = '#0a2547';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = Math.round(Math.min(VW, VH) * 0.15);
    ctx.fillStyle = G.newBest ? ART.yellow : '#ffffff';
    ctx.font = `800 ${big}px ${SANS}`;
    ctx.fillText(String(G.score), VW / 2, VH * 0.42);
    ctx.fillStyle = '#b8dcf7';
    ctx.font = `700 ${Math.round(big * 0.24)}px ${SANS}`;
    ctx.fillText('AREA ' + String(G.floor).padStart(2, '0') + '   BEST ' + G.best, VW / 2, VH * 0.42 + big * 0.85);
    ctx.globalAlpha = 1;
  }
}

function drawPreview(o) {
  const P = G.player;
  ctx.strokeStyle = o.danger ? ART.red : ART.yellow;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(2, CELL * 0.06);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(CX(P.x), CY(P.y));
  for (const b of o.path) ctx.lineTo(CX(b.x), CY(b.y));
  if (o.crash) ctx.lineTo(CX(o.crash.x), CY(o.crash.y));
  if (o.clank) ctx.lineTo(CX(o.clank.x), CY(o.clank.y));
  ctx.stroke();
  // cells passed
  for (let i = 1; i < o.path.length; i++) {
    ctx.fillStyle = ART.yellow;
    ctx.globalAlpha = 0.13;
    ctx.fillRect(X(o.path[i].x) + 2, Y(o.path[i].y) + 2, CELL - 4, CELL - 4);
  }
  // stop marks
  const stop = o.crash || o.clank;
  if (stop) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = ART.red;
    ctx.lineWidth = 3;
    const s = CELL * 0.14;
    ctx.beginPath();
    ctx.moveTo(CX(stop.x) - s, CY(stop.y) - s); ctx.lineTo(CX(stop.x) + s, CY(stop.y) + s);
    ctx.moveTo(CX(stop.x) + s, CY(stop.y) - s); ctx.lineTo(CX(stop.x) - s, CY(stop.y) + s);
    ctx.stroke();
  }
  // targets
  for (const k of o.kills) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = ART.yellow;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(CX(k.e.x), CY(k.e.y), CELL * 0.45, 0, TAU);
    ctx.stroke();
  }
  // momentum after the move
  if (o.vx || o.vy) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(CX(o.ex), CY(o.ey));
    ctx.lineTo(CX(o.ex + o.vx), CY(o.ey + o.vy));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

let speedBtns = [];
function drawHud() {
  const P = G.player;
  const y = Math.max(12, OY - 46);
  const big = Math.round(clamp(CELL * 0.62, 19, 28));
  // a pale plate behind the figures
  ctx.fillStyle = 'rgba(10,38,76,0.74)';
  roundRect(OX - 2, y - 9, CELL * N + 4, big + 28, 10);
  ctx.fill();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${big}px ${SANS}`;
  ctx.fillText(String(G.score), OX + 12, y - 2);
  const sw = ctx.measureText(String(G.score)).width;
  if (G.best > 0) {
    ctx.fillStyle = G.score > G.best ? ART.yellow : '#8fb4d6';
    ctx.font = `700 ${Math.round(clamp(CELL * 0.26, 10, 13))}px ${SANS}`;
    ctx.fillText('BEST ' + Math.max(G.best, G.score), OX + 12, y + big + 1);
    ctx.font = `800 ${big}px ${SANS}`;
  }
  if (G.streak >= 2) {
    ctx.fillStyle = ART.yellow;
    ctx.font = `800 ${Math.round(clamp(CELL * 0.44, 14, 21))}px ${SANS}`;
    ctx.fillText('×' + G.streak, OX + 12 + sw + 10, y + 3);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cfe6f8';
  ctx.font = `800 ${Math.round(clamp(CELL * 0.4, 13, 18))}px ${SANS}`;
  ctx.fillText('AREA ' + String(G.floor).padStart(2, '0'), OX + CELL * N / 2, y + 4);
  // hit points: three little fighters
  const hr = clamp(CELL * 0.2, 7, 11);
  for (let i = 0; i < 3; i++) miniJet(OX + CELL * N - 16 - i * (hr * 2.6) - hr * 0.3, y + hr + 4, hr, i < P.hp ? '#ffffff' : '#5b7da3', i < P.hp ? 1 : 0.55);
  // flight speed: slow, steady, quick
  speedBtns = [];
  {
    const bw = 34, bh = 18, gap = 6, by0 = OY + CELL * N + 5;
    const x0 = OX + CELL * N - 3 * bw - 2 * gap;
    for (let i = 0; i < 3; i++) {
      const bx = x0 + i * (bw + gap);
      const on = i === speedIdx;
      ctx.fillStyle = on ? '#ffffff' : 'rgba(10,38,76,0.6)';
      roundRect(bx, by0, bw, bh, 9);
      ctx.fill();
      ctx.fillStyle = on ? ART.navy : '#bcd8ee';
      for (let k = 0; k <= i; k++) {
        const cx0 = bx + bw / 2 + (k - i / 2) * 7;
        ctx.beginPath();
        ctx.moveTo(cx0 - 3, by0 + 5); ctx.lineTo(cx0 + 3, by0 + bh / 2); ctx.lineTo(cx0 - 3, by0 + bh - 5);
        ctx.closePath();
        ctx.fill();
      }
      speedBtns.push({ x: bx - 3, y: by0 - 9, w: bw + 6, h: bh + 18, i });
    }
  }
  // progress: one pip per aircraft to bring down
  const by = OY + CELL * N + 14;
  const total = G.quota;
  const areaW = CELL * N - 3 * 34 - 2 * 6 - 14;
  const dw = clamp(areaW / Math.max(1, total) - 3, 3, 12);
  const startX = OX + 4;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < G.killed ? '#ffffff' : 'rgba(10,38,76,0.55)';
    roundRect(startX + i * (dw + 3), by - 3, dw, 6, 3);
    ctx.fill();
  }
}

// ============================================================ input
// screen point -> canvas layout coordinates, whatever size the canvas is displayed at
function toLocal(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (VW / (r.width || VW)), (e.clientY - r.top) * (VH / (r.height || VH))];
}

function markerAt(mx, my) {
  const x = Math.floor((mx - OX) / CELL), y = Math.floor((my - OY) / CELL);
  return G.markers.find(o => o.ex === x && o.ey === y) || null;
}

function restartIfOver() {
  if (G.over && G.clock > G.overT + 0.6) { newRun(); return true; }
  return G.over;
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || busy() || G.over) return;
  const m = markerAt(...toLocal(e));
  if (m !== G.hover) G.hover = m;
});
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  canvas.focus();
  Sfx.ensure();
  const [lx, ly] = toLocal(e);
  for (const b of speedBtns) {
    if (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h) { if (!G.over) { setSpeed(b.i); Sfx.select(); } return; }
  }
  if (restartIfOver()) return;
  if (busy()) return;
  const m = markerAt(lx, ly);
  if (e.pointerType === 'mouse') {
    if (m) commit(m);
    return;
  }
  // touch / pen: first tap shows the path, second tap goes
  if (!m) { G.selected = null; G.hover = null; return; }
  if (G.selected === m) commit(m);
  else { G.selected = m; G.hover = m; Sfx.select(); }
});

const held = new Set();
let chord = new Set();
const DIRKEY = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};
const NUMPAD = {
  Numpad1: [-1, 1], Numpad2: [0, 1], Numpad3: [1, 1], Numpad4: [-1, 0], Numpad5: [0, 0],
  Numpad6: [1, 0], Numpad7: [-1, -1], Numpad8: [0, -1], Numpad9: [1, -1],
};
function chordAccel() {
  let ax = 0, ay = 0;
  for (const k of chord) { ax += DIRKEY[k][0]; ay += DIRKEY[k][1]; }
  return [clamp(ax, -1, 1), clamp(ay, -1, 1)];
}
function optionFor(ax, ay) {
  const o = G.options.find(p => p.ax === ax && p.ay === ay);
  if (!o) return null;
  return G.markers.find(m => m.ex === o.ex && m.ey === o.ey) || o;
}
window.addEventListener('keydown', e => {
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { setSpeed(+e.code[5] - 1); return; }
  if (DIRKEY[e.code] || NUMPAD[e.code] || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
  Sfx.ensure();
  if (e.repeat) return;
  if (G.over) { restartIfOver(); return; }
  if (DIRKEY[e.code]) {
    held.add(e.code);
    chord.add(e.code);
    if (!busy()) { const [ax, ay] = chordAccel(); G.hover = optionFor(ax, ay); }
  } else if (NUMPAD[e.code]) {
    if (!busy()) commit(optionFor(...NUMPAD[e.code]));
  } else if (e.code === 'Space' || e.code === 'Enter') {
    if (!busy()) commit(G.selected || optionFor(0, 0));
  }
});
window.addEventListener('keyup', e => {
  if (!DIRKEY[e.code]) return;
  held.delete(e.code);
  if (held.size === 0 && chord.size) {
    const [ax, ay] = chordAccel();
    chord = new Set();
    if (!busy() && !G.over) commit(optionFor(ax, ay));
  }
});
window.addEventListener('blur', () => { held.clear(); chord = new Set(); });

// ============================================================ loop
function frame(t) {
  G.clock = t / 1000;
  const r = canvas.getBoundingClientRect();
  if (Math.abs(r.width - VW) > 1 || Math.abs(r.height - VH) > 1) resize();
  update();
  draw();
  requestAnimationFrame(frame);
}
G.clock = performance.now() / 1000;
G.titleT = G.clock;
newRun();
G.transT = -9;
requestAnimationFrame(frame);

// hooks for automated checks
window.__kansei = {
  G,
  commit: o => commit(o),
  optionFor,
  sim: (ax, ay) => simulate(ax, ay),
  plan: (o, t0, step, crashed) => planManeuvers(o, t0, step, crashed),
  threats: ks => threatCells(ks),
  setSeed: s => { seed = s >>> 0; },
  newRun,
  skip: () => { if (G.tl) G.tl.end = -1; update(); },
};
})();
