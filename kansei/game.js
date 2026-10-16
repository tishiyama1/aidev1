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
  curtainCache = null;
  titleCache = null;
}
let curtainCache = null, titleCache = null;
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
    move(speed, delay) { noise(0.08 + speed * 0.03, { vol: 0.05 + speed * 0.015, freq: 500 + speed * 250, q: 0.8, delay }); },
    kill(k, delay) {
      const f = 330 * Math.pow(2, SCALE[Math.min(k, SCALE.length - 1)] / 12);
      // a music-box note over the sound of porcelain breaking
      tone(f, 0.55, { type: 'sine', vol: 0.12, delay });
      tone(f * 2.76, 0.26, { type: 'sine', vol: 0.045, delay });
      tone(f * 5.4, 0.12, { type: 'sine', vol: 0.02, delay });
      noise(0.1, { vol: 0.08, freq: 3200, delay });
    },
    bounce(delay) { tone(1560, 0.3, { vol: 0.07, to: 2300, delay }); tone(620, 0.16, { vol: 0.07, to: 940, delay }); noise(0.18, { vol: 0.09, freq: 5200, q: 1.5, delay }); },
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
  flashes: [], popups: [], particles: [], shake: 0, hurtT: -9, transT: -9, titleT: 0, bumpT: new Map(),
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
  spike: { color: '#ff4636' },
  shell: { color: '#ff4636' },
  lancer: { color: '#ffb03a' },
  mortar: { color: '#d467d9' },
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
const STEP_T = 0.065;

function commit(o) {
  if (!o || G.over || busy()) return;
  const P = G.player;
  const now = G.clock;
  G.oldMarks = G.enemies.map(e => ({ id: e.id, type: e.type, cells: e.marks.slice(), aim: e.aim }));
  G.deadAt = new Map();
  G.path = o.path;
  const pathDur = Math.max(0.12, (o.path.length - 1) * STEP_T);
  const enemyT = now + pathDur + 0.05;
  G.tl = { t0: now, pathEnd: now + pathDur, enemyT, end: enemyT + 0.42 };
  Sfx.move(o.speed, 0);
  for (const b of o.bounces) {
    const idx = Math.max(1, o.path.findIndex(p => p.x === b.cx && p.y === b.cy));
    const t = now + Math.max(0, idx) * STEP_T;
    G.bumpT.set(b.cell[1] * N + b.cell[0], t);
    burst(b.cell[0], b.cell[1], ART.glassHi, t, 8);
    Sfx.bounce(t - now);
  }
  if (o.crash || o.clank) { Sfx.crash(pathDur); G.shakeAt = now + pathDur; G.shakeAmp = 4; }

  // kills
  const nk = o.kills.length + (o.stomp ? 1 : 0);
  if (nk > 0) G.streak = Math.min(9, G.streak + 1); else G.streak = 0;
  const mult = Math.max(1, G.streak);
  o.kills.forEach((k, i) => {
    const t = now + k.step * STEP_T;
    G.deadAt.set(k.e.id, t);
    G.corpses.push({ type: k.e.type, x: k.e.x, y: k.e.y, t });
    addScore(10 * (i + 1) * mult, k.e.x, k.e.y, t, i >= 1);
    Sfx.kill(i, t - now);
    burst(k.e.x, k.e.y, TYPES[k.e.type].color, t, 14 + i * 6);
  });
  G.enemies = G.enemies.filter(e => !o.killSet.has(e));
  if (o.stomp) {
    G.spawns = G.spawns.filter(s => s !== o.stomp);
    const t = now + pathDur;
    addScore(10 * (o.kills.length + 1) * mult, o.stomp.x, o.stomp.y, t, false);
    burst(o.stomp.x, o.stomp.y, '#ffffff', t, 10);
    Sfx.kill(o.kills.length, pathDur);
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
}

function clearFloor(t) {
  const bonus = 50 * G.floor;
  addScore(bonus, G.player.x, G.player.y, t, true);
  G.pendingClear = true;
  G.tl.end = t + 0.9;
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
    G.corpses.push({ type: o.type, x: o.x, y: o.y, t: t + 0.08 });
    addScore(10 * mult, o.x, o.y, t + 0.08, false);
    burst(o.x, o.y, TYPES[o.type].color, t + 0.08, 12);
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
      e.bornT = t + 0.12;
      G.enemies.push(e);
      Sfx.spawn(t + 0.12 - G.clock);
    } else still.push(s);
  }
  G.spawns = still;

  // 3. movement
  const d = distMap();
  const order = G.enemies.slice().sort((a, b) => d[a.y * N + a.x] - d[b.y * N + b.x]);
  for (const e of order) {
    e.fx = e.x; e.fy = e.y;
    moveEnemy(e, d);
    e.mt0 = t + 0.12;
    e.mt1 = t + 0.32;
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

// ============================================================ fx
// porcelain, glass and brass flying apart
function burst(x, y, color, t, n) {
  const mix = [color, ART.ivory, ART.gold, color];
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, s = 1.5 + rnd() * 4;
    G.particles.push({
      x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t, life: 0.45 + rnd() * 0.5,
      color: mix[i % mix.length], rot: rnd() * TAU, spin: (rnd() - 0.5) * 12, size: 0.6 + rnd() * 0.9, cog: i === 0 && n >= 10,
    });
  }
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
}

// ============================================================ art direction
// Follows the reference poster (design/kansei-art.md): a baroque ballroom,
// velvet and antique gold, white porcelain automata, a mirror that shatters.
const ART = {
  ink: '#0e0809', floorA: '#1b1312', floorB: '#201716', seam: '#4d3a1a',
  gold: '#d6b25e', goldDim: '#8a6d33', ivory: '#efe6d2', porcelain: '#d9cfb8',
  glass: '#7fd6d0', glassHi: '#b4f2ea', threat: '#ff4636', crimson: '#b3182c', velvet: '#4a0b14',
};
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function kanjiNum(n) {
  if (n < 10) return KANJI[n];
  if (n < 20) return '十' + (n % 10 ? KANJI[n % 10] : '');
  if (n < 100) return KANJI[Math.floor(n / 10)] + '十' + (n % 10 ? KANJI[n % 10] : '');
  return String(n);
}
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// the curtains: drawn once per size, then blitted
function buildCurtain() {
  const c = document.createElement('canvas');
  c.width = Math.round(VW * DPR); c.height = Math.round(VH * DPR);
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  const base = g.createLinearGradient(0, 0, 0, VH);
  base.addColorStop(0, '#2c070e'); base.addColorStop(0.5, '#3f0c16'); base.addColorStop(1, '#1b0509');
  g.fillStyle = base;
  g.fillRect(0, 0, VW, VH);
  // folds: two layers of different widths
  for (const [fw, al] of [[Math.max(38, VW / 13), 1], [Math.max(23, VW / 21), 0.5]]) {
    for (let x = -fw * 0.3; x < VW + fw; x += fw) {
      const gr = g.createLinearGradient(x, 0, x + fw, 0);
      gr.addColorStop(0, `rgba(0,0,0,${0.5 * al})`);
      gr.addColorStop(0.3, `rgba(160,34,48,${0.26 * al})`);
      gr.addColorStop(0.55, `rgba(205,60,66,${0.14 * al})`);
      gr.addColorStop(1, `rgba(0,0,0,${0.55 * al})`);
      g.fillStyle = gr;
      g.fillRect(x, 0, fw, VH);
    }
  }
  // swag across the top, with a gold trim and tassels
  const vh = Math.max(30, Math.min(64, VH * 0.07));
  const n = Math.max(4, Math.round(VW / 150));
  const sw = VW / n;
  g.fillStyle = '#4e0d19';
  g.fillRect(0, 0, VW, vh * 0.55);
  for (let i = 0; i < n; i++) {
    const x0 = i * sw;
    g.beginPath();
    g.moveTo(x0, vh * 0.55);
    g.quadraticCurveTo(x0 + sw / 2, vh * 1.55, x0 + sw, vh * 0.55);
    g.closePath();
    const sg = g.createLinearGradient(0, vh * 0.55, 0, vh * 1.3);
    sg.addColorStop(0, '#5f1220'); sg.addColorStop(1, '#2b070e');
    g.fillStyle = sg;
    g.fill();
    g.strokeStyle = ART.gold;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(x0, vh * 0.55);
    g.quadraticCurveTo(x0 + sw / 2, vh * 1.55, x0 + sw, vh * 0.55);
    g.stroke();
    // tassel
    const tx = x0 + sw / 2, ty = vh * 1.05;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx, ty + vh * 0.35); g.stroke();
    g.fillStyle = ART.gold;
    g.beginPath(); g.arc(tx, ty + vh * 0.42, 3.2, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = ART.gold;
  g.fillRect(0, vh * 0.52, VW, 2.5);
  // darken toward the edges and the floor
  const vg = g.createRadialGradient(VW / 2, VH * 0.5, Math.min(VW, VH) * 0.3, VW / 2, VH * 0.5, Math.max(VW, VH) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0.0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  g.fillStyle = vg;
  g.fillRect(0, 0, VW, VH);
  return c;
}

// golden dust, drifting
const MOTES = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, ph: Math.random() * 6.28 }));
function drawBackdrop(now) {
  if (!curtainCache) curtainCache = buildCurtain();
  ctx.drawImage(curtainCache, 0, 0, VW, VH);
  // candlelight along the top
  const vh = Math.max(30, Math.min(64, VH * 0.07));
  for (let i = 0; i < 5; i++) {
    const x = VW * (0.1 + i * 0.2), y = vh * 1.9;
    const fl = 0.75 + 0.25 * Math.sin(now * 5.3 + i * 2.1) * Math.sin(now * 3.1 + i);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.min(VW, VH) * 0.18);
    gr.addColorStop(0, `rgba(255,205,120,${0.2 * fl})`);
    gr.addColorStop(1, 'rgba(255,205,120,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - VW * 0.2, y - VH * 0.2, VW * 0.4, VH * 0.4);
    ctx.fillStyle = `rgba(255,236,190,${0.55 * fl})`;
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
  }
  // motes
  ctx.fillStyle = ART.gold;
  for (const m of MOTES) {
    m.ph += 0.01 * m.z;
    m.y -= 0.0006 * m.z;
    if (m.y < -0.02) m.y = 1.02;
    ctx.globalAlpha = 0.12 + 0.2 * m.z * (0.5 + 0.5 * Math.sin(m.ph * 3));
    ctx.fillRect(((m.x + Math.sin(m.ph) * 0.01) % 1) * VW, m.y * VH, 1.6 * m.z + 0.4, 1.6 * m.z + 0.4);
  }
  ctx.globalAlpha = 1;
}

// gilded frame around the floor (a mirror frame when the edges bounce)
function drawFrame(now) {
  const x = OX - 7, y = OY - 7, w = CELL * N + 14, h = CELL * N + 14;
  ctx.strokeStyle = ART.gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = ART.goldDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  if (G.edgeBounce) {
    ctx.strokeStyle = ART.glassHi;
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(now * 2.6);
    ctx.lineWidth = 3;
    ctx.strokeRect(OX - 2, OY - 2, CELL * N + 4, CELL * N + 4);
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 9;
    ctx.strokeRect(OX - 2, OY - 2, CELL * N + 4, CELL * N + 4);
    ctx.globalAlpha = 1;
  }
  // corner ornaments: a diamond with a small arc on each side
  const r = 9;
  for (const [cx0, cy0, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.fillStyle = ART.gold;
    ctx.beginPath();
    ctx.moveTo(cx0, cy0 - sy * r); ctx.lineTo(cx0 + sx * r, cy0); ctx.lineTo(cx0, cy0 + sy * r); ctx.lineTo(cx0 - sx * r, cy0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ART.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx0 + sx * 15, cy0 + sy * 15, 7, 0, TAU);
    ctx.stroke();
  }
}

// ============================================================ draw
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

function enemyPos(e) {
  if (G.clock <= e.mt0) return [e.fx, e.fy];
  if (G.clock >= e.mt1) return [e.x, e.y];
  const k = (G.clock - e.mt0) / (e.mt1 - e.mt0);
  const s = k * k * (3 - 2 * k);
  return [e.fx + (e.x - e.fx) * s, e.fy + (e.y - e.fy) * s];
}

function playerPos(at) {
  const P = G.player;
  const t = at == null ? G.clock : at;
  if (G.path && G.tl && t < G.tl.pathEnd) {
    const f = Math.max(0, (t - G.tl.t0) / STEP_T);
    const i = Math.min(G.path.length - 1, Math.floor(f));
    const j = Math.min(G.path.length - 1, i + 1);
    const k = f - i;
    return [G.path[i].x + (G.path[j].x - G.path[i].x) * k, G.path[i].y + (G.path[j].y - G.path[i].y) * k];
  }
  return [P.x, P.y];
}

function drawEnemy(type, x, y, e, a, scale) {
  const cx = CX(x), cy = CY(y), r = CELL * 0.34 * scale;
  const col = TYPES[type].color;
  ctx.globalAlpha = a;
  ctx.lineWidth = Math.max(1.5, CELL * 0.05);
  ctx.lineJoin = 'round';
  if (type === 'spike') {
    // a gilded cog with a red jewel
    ctx.fillStyle = '#2a1511';
    ctx.strokeStyle = ART.gold;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * TAU + G.clock * 0.6;
      const rr = (i % 2 ? 0.74 : 1) * r;
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ART.goldDim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, TAU);
    ctx.fill();
  } else if (type === 'shell') {
    // a porcelain mask in a gold rim; the dots are its armour
    ctx.fillStyle = '#e2d8c0';
    ctx.strokeStyle = ART.gold;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + Math.PI / 6;
      if (i) ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); else ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#1b0f0d';
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy - r * 0.08); ctx.lineTo(cx - r * 0.15, cy + r * 0.08);
    ctx.moveTo(cx + r * 0.55, cy - r * 0.08); ctx.lineTo(cx + r * 0.15, cy + r * 0.08);
    ctx.stroke();
    ctx.lineCap = 'butt';
    const arm = e ? e.armor : 2;
    ctx.fillStyle = '#a07a28';
    for (let i = 0; i < arm; i++) {
      const px = cx + (i - (arm - 1) / 2) * r * 0.42;
      ctx.beginPath();
      ctx.arc(px, cy - r * 0.5, Math.max(1.8, r * 0.12), 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.2, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy + r * 0.55); ctx.lineTo(cx + r * 0.3, cy + r * 0.55);
    ctx.stroke();
  } else if (type === 'lancer') {
    // a gold rapier, point first
    const P = G.player;
    const aim = e && e.aim ? Math.atan2(e.aim[1], e.aim[0]) : Math.atan2(P.y - y, P.x - x);
    ctx.fillStyle = '#2a1a08';
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(aim) * r * 1.25, cy + Math.sin(aim) * r * 1.25);
    ctx.lineTo(cx + Math.cos(aim + 2.4) * r, cy + Math.sin(aim + 2.4) * r);
    ctx.lineTo(cx + Math.cos(aim - 2.4) * r, cy + Math.sin(aim - 2.4) * r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ART.gold;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(aim) * r * 0.5, cy - Math.sin(aim) * r * 0.5);
    ctx.lineTo(cx + Math.cos(aim) * r * 1.0, cy + Math.sin(aim) * r * 1.0);
    ctx.stroke();
    if (e && e.aim) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, TAU);
      ctx.fill();
    }
  } else if (type === 'mortar') {
    // a bronze bell in a square case
    ctx.fillStyle = '#24121a';
    ctx.strokeStyle = col;
    roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ART.goldDim;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = ART.gold;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.55, r * 0.1, 0, TAU);
    ctx.fill();
    if (e && e.aim) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
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
    ctx.globalAlpha = 0.28 * a;
    ctx.fillRect(X(x) + 2, Y(y) + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 0.9 * a;
    const s = CELL * 0.14;
    // corner ticks
    ctx.fillRect(X(x) + 3, Y(y) + 3, s, 2); ctx.fillRect(X(x) + 3, Y(y) + 3, 2, s);
    ctx.fillRect(X(x + 1) - 3 - s, Y(y) + 3, s, 2); ctx.fillRect(X(x + 1) - 5, Y(y) + 3, 2, s);
    ctx.fillRect(X(x) + 3, Y(y + 1) - 5, s, 2); ctx.fillRect(X(x) + 3, Y(y + 1) - 3 - s, 2, s);
    ctx.fillRect(X(x + 1) - 3 - s, Y(y + 1) - 5, s, 2); ctx.fillRect(X(x + 1) - 5, Y(y + 1) - 3 - s, 2, s);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = ART.ink;
  ctx.fillRect(0, 0, VW, VH);
  if (!G.player) return;
  const now = G.clock;
  drawBackdrop(now);

  // shake
  let sx = 0, sy = 0;
  if (G.shakeAt != null) {
    const k = now - G.shakeAt;
    if (k >= 0 && k < 0.3) {
      const amp = (G.shakeAmp || 6) * (1 - k / 0.3);
      sx = (Math.random() - 0.5) * amp;
      sy = (Math.random() - 0.5) * amp;
    }
  }
  ctx.save();
  ctx.translate(sx, sy);

  // board: a polished parquet floor inside a gilded frame
  drawFrame(now);
  ctx.fillStyle = ART.seam;
  ctx.fillRect(OX, OY, CELL * N, CELL * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = G.grid[y * N + x];
      const px = X(x) + 1, py = Y(y) + 1, w = CELL - 2;
      if (t === 0) {
        ctx.fillStyle = (x + y) % 2 ? ART.floorA : ART.floorB;
        ctx.fillRect(px, py, w, w);
        // a faint diamond inlay
        ctx.fillStyle = 'rgba(214,178,94,0.06)';
        ctx.beginPath();
        ctx.moveTo(px + w / 2, py + w * 0.2); ctx.lineTo(px + w * 0.8, py + w / 2); ctx.lineTo(px + w / 2, py + w * 0.8); ctx.lineTo(px + w * 0.2, py + w / 2);
        ctx.closePath();
        ctx.fill();
      } else if (t === 1) {
        // marble plinth
        ctx.fillStyle = '#3a2f26';
        ctx.fillRect(px, py, w, w);
        ctx.fillStyle = '#5d4b39';
        ctx.fillRect(px, py, w, CELL * 0.18);
        ctx.strokeStyle = ART.goldDim;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 2.5, py + 2.5, w - 5, w - 5);
        ctx.fillStyle = 'rgba(214,178,94,0.35)';
        ctx.beginPath();
        ctx.moveTo(px + w / 2, py + w * 0.4); ctx.lineTo(px + w * 0.62, py + w * 0.6); ctx.lineTo(px + w / 2, py + w * 0.8); ctx.lineTo(px + w * 0.38, py + w * 0.6);
        ctx.closePath();
        ctx.fill();
      } else {
        // mirror
        const bt = G.bumpT.get(y * N + x);
        const glow = bt != null && now >= bt && now - bt < 0.5 ? 1 - (now - bt) / 0.5 : 0;
        const gr = ctx.createLinearGradient(px, py, px + w, py + w);
        gr.addColorStop(0, '#12302f'); gr.addColorStop(0.5, '#1f5656'); gr.addColorStop(1, '#0d2626');
        ctx.fillStyle = gr;
        ctx.fillRect(px, py, w, w);
        ctx.strokeStyle = 'rgba(220,255,250,0.28)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + w * 0.15, py + w * 0.55); ctx.lineTo(px + w * 0.55, py + w * 0.15);
        ctx.moveTo(px + w * 0.4, py + w * 0.85); ctx.lineTo(px + w * 0.85, py + w * 0.4);
        ctx.stroke();
        ctx.strokeStyle = ART.gold;
        ctx.lineWidth = 2;
        roundRect(px + CELL * 0.08, py + CELL * 0.08, w - CELL * 0.16, w - CELL * 0.16, CELL * 0.1);
        ctx.stroke();
        ctx.strokeStyle = ART.glassHi;
        ctx.lineWidth = 1.5 + glow * 2.5;
        ctx.globalAlpha = 0.55 + 0.45 * glow;
        roundRect(px + CELL * 0.17, py + CELL * 0.17, w - CELL * 0.34, w - CELL * 0.34, CELL * 0.06);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (glow > 0) {
          // the glass cracks where it was struck
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = glow;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          const ccx = px + w / 2, ccy = py + w / 2;
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * TAU + hash2(x * 7 + k, y * 3) * 0.5;
            const len = w * (0.25 + 0.3 * hash2(x + k * 5, y * 9 + 1));
            ctx.moveTo(ccx, ccy);
            ctx.lineTo(ccx + Math.cos(ang) * len * 0.55 + Math.sin(ang * 3) * 2, ccy + Math.sin(ang) * len * 0.55);
            ctx.lineTo(ccx + Math.cos(ang + 0.15) * len, ccy + Math.sin(ang + 0.15) * len);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  }
  // the sheen of a polished floor
  {
    const sg = ctx.createLinearGradient(OX, OY, OX + CELL * N, OY + CELL * N);
    sg.addColorStop(0, 'rgba(255,225,170,0.07)');
    sg.addColorStop(0.45, 'rgba(255,225,170,0)');
    sg.addColorStop(1, 'rgba(255,225,170,0.035)');
    ctx.fillStyle = sg;
    ctx.fillRect(OX, OY, CELL * N, CELL * N);
  }

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
    ctx.globalAlpha = 0.65 * (1 - k);
    for (const [x, y] of f.cells) ctx.fillRect(X(x) + 1, Y(y) + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 1;
  }

  // incoming
  for (const s of G.spawns) {
    if (now < s.t) continue;
    ctx.strokeStyle = TYPES[s.type].color;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.lineDashOffset = -now * 20;
    ctx.beginPath();
    ctx.arc(CX(s.x), CY(s.y), CELL * 0.3, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // enemies
  for (const e of G.enemies) {
    const [x, y] = enemyPos(e);
    const born = now < e.bornT ? 0 : Math.min(1, (now - e.bornT) / 0.25);
    if (born <= 0) continue;
    drawEnemy(e.type, x, y, e, born, 0.6 + 0.4 * born);
  }
  for (const c of G.corpses) {
    if (now < c.t) drawEnemy(c.type, c.x, c.y, null, 1, 1);
  }

  // move options
  const P = G.player;
  const [ppx, ppy] = playerPos();
  if (showNew && !G.over && !G.pendingClear) {
    // where momentum alone would carry you
    const cxv = P.x + P.vx, cyv = P.y + P.vy;
    if (P.vx || P.vy) {
      ctx.strokeStyle = ART.ivory;
      ctx.globalAlpha = 0.25;
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
      const col = o.danger ? ART.threat : ART.glassHi;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.globalAlpha = isAct ? 1 : 0.8;
      const stops = !!(o.crash || o.clank);
      // a dark backing so the marker stays readable on top of any threat mark
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#0c0707';
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
        ctx.fillStyle = ART.gold;
        for (let i = 0; i < o.kills.length; i++) {
          const a = -Math.PI / 2 + (i - (o.kills.length - 1) / 2) * 0.6;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5), 2.2, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // player: a white porcelain dancer, seen from above
  {
    const hurtK = now - G.hurtT;
    const cx = CX(ppx), cy = CY(ppy);
    const sp = Math.max(Math.abs(P.vx), Math.abs(P.vy));
    const moving = G.tl && now < G.tl.pathEnd;
    // afterimages along the way she has just come
    const ghosts = [];
    if (moving) { for (let i = 1; i <= 4; i++) ghosts.push(playerPos(now - i * 0.06)); }
    else if (sp > 0 && !G.over) { for (let i = 1; i <= 3; i++) ghosts.push([P.x - P.vx * 0.32 * i, P.y - P.vy * 0.32 * i]); }
    ghosts.forEach(([gx, gy], i) => {
      ctx.globalAlpha = 0.3 - i * 0.065;
      ctx.fillStyle = ART.ivory;
      ctx.beginPath();
      ctx.arc(CX(gx), CY(gy), CELL * (0.24 - i * 0.025), 0, TAU);
      ctx.fill();
    });
    // the red thread streams out behind
    let dx = -P.vx, dy = -P.vy, len = Math.min(sp, 4) * CELL * 0.55;
    if (moving) {
      const [bx, by] = playerPos(now - 0.1);
      dx = bx - ppx; dy = by - ppy;
      len = Math.min(3.2, Math.hypot(dx, dy) * 1.6) * CELL;
    }
    const dl = Math.hypot(dx, dy);
    if (len > 3 && dl > 0.001 && !G.over) {
      const ux = dx / dl, uy = dy / dl;
      const wob = Math.sin(now * 7) * CELL * 0.14;
      ctx.strokeStyle = ART.crimson;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = Math.max(1.6, CELL * 0.055);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + ux * len * 0.5 - uy * wob, cy + uy * len * 0.5 + ux * wob, cx + ux * len, cy + uy * len);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, CELL * 0.75);
    glow.addColorStop(0, 'rgba(255,236,200,0.3)');
    glow.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.75, 0, TAU);
    ctx.fill();
    if (!G.over || now < G.overT) {
      const flash = hurtK >= 0 && hurtK < 0.4 && Math.floor(hurtK * 20) % 2 === 0;
      // gear ring
      const spin = G.turn * 0.7 + now * (0.6 + sp * 0.8);
      ctx.fillStyle = flash ? ART.crimson : ART.gold;
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * TAU + spin;
        const rr = CELL * (i % 2 ? 0.27 : 0.33);
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // the porcelain
      const bg = ctx.createRadialGradient(cx - CELL * 0.06, cy - CELL * 0.08, 0, cx, cy, CELL * 0.23);
      bg.addColorStop(0, flash ? '#ffb0a8' : '#fffaf0');
      bg.addColorStop(1, flash ? '#d44' : ART.porcelain);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.23, 0, TAU);
      ctx.fill();
      // a mend of gold across the face
      ctx.strokeStyle = ART.gold;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - CELL * 0.17, cy - CELL * 0.05); ctx.lineTo(cx - CELL * 0.03, cy + CELL * 0.02); ctx.lineTo(cx + CELL * 0.05, cy - CELL * 0.07); ctx.lineTo(cx + CELL * 0.16, cy + CELL * 0.06);
      ctx.stroke();
    }
  }

  // particles
  for (const p of G.particles) {
    const k = now - p.t;
    if (k < 0) continue;
    const e = 1 - Math.exp(-k * 4);
    ctx.globalAlpha = Math.max(0, 1 - k / p.life);
    const px = CX(p.x - 0.5 + p.vx * e * 0.25), py = CY(p.y - 0.5 + p.vy * e * 0.25);
    const sz = Math.max(2.5, CELL * 0.1) * p.size;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.rot + p.spin * k);
    if (p.cog) {
      // a gear tumbles out
      ctx.strokeStyle = ART.gold;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, sz * 1.1, 0, TAU);
      for (let q = 0; q < 6; q++) { const aa = (q / 6) * TAU; ctx.moveTo(Math.cos(aa) * sz * 1.1, Math.sin(aa) * sz * 1.1); ctx.lineTo(Math.cos(aa) * sz * 1.7, Math.sin(aa) * sz * 1.7); }
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.6, sz * 0.7); ctx.lineTo(-sz * 0.4, -sz * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // score popups
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of G.popups) {
    const k = now - p.t;
    if (k < 0) continue;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = p.big ? ART.gold : ART.ivory;
    ctx.font = `700 ${Math.round(CELL * (p.big ? 0.52 : 0.4))}px ${SERIF}`;
    ctx.fillText(p.text, CX(p.x), CY(p.y) - k * CELL * 0.8);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHud();

  // hurt vignette
  const hk = now - G.hurtT;
  if (hk >= 0 && hk < 0.5) {
    ctx.fillStyle = '#b3182c';
    ctx.globalAlpha = 0.3 * (1 - hk / 0.5);
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  }

  // the curtains part on each new act
  const tk = now - G.transT;
  if (tk >= 0 && tk < 1.6) {
    const e = clamp((tk - 0.55) / 0.9, 0, 1);
    drawCurtainPanels(1 - e * e * (3 - 2 * e));
    const a = tk < 0.45 ? 1 : Math.max(0, 1 - (tk - 0.45) / 0.45);
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.fillStyle = ART.gold;
      ctx.font = `600 ${Math.round(CELL * 1.2)}px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('第' + kanjiNum(G.floor) + '幕', VW / 2, VH / 2);
      ctx.globalAlpha = 1;
    }
  }

  // title, first moments only: vertical, top left, as on the poster
  if (G.titleT > -1) {
    const k = now - G.titleT;
    if (k < 4) {
      const t = titleSprite();
      const room = OX - 14;
      const x = room > t.w * 0.95 ? Math.max(10, (room - t.w) / 2) : 12;
      ctx.globalAlpha = (k < 1 ? k : k < 2.4 ? 1 : 1 - (k - 2.4) / 1.6) * (room > t.w * 0.95 ? 0.95 : 0.6);
      ctx.drawImage(t.c, x, Math.max(20, VH * 0.06), t.w, t.h);
      ctx.globalAlpha = 1;
    }
  }

  // game over: the curtain falls, and the score is set in gold
  if (G.over && now >= G.overT) {
    const e = clamp((now - G.overT) / 0.9, 0, 1);
    drawCurtainPanels(e * e * (3 - 2 * e));
    if (e >= 1) {
      ctx.globalAlpha = clamp((now - G.overT - 0.9) / 0.5, 0, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const big = Math.round(Math.min(VW, VH) * 0.14);
      ctx.fillStyle = G.newBest ? ART.gold : ART.ivory;
      ctx.font = `600 ${big}px ${SERIF}`;
      ctx.fillText(String(G.score), VW / 2, VH * 0.42);
      ctx.fillStyle = ART.gold;
      ctx.font = `500 ${Math.round(big * 0.24)}px ${SERIF}`;
      ctx.fillText('第' + kanjiNum(G.floor) + '幕　　BEST ' + G.best, VW / 2, VH * 0.42 + big * 0.85);
      ctx.globalAlpha = 1;
    }
  }
}

// two panels of the curtain; open = 1 draws them fully apart, 0 fully shut
function drawCurtainPanels(closed) {
  if (closed <= 0.001) return;
  if (!curtainCache) curtainCache = buildCurtain();
  const half = VW / 2, w = half * closed;
  ctx.drawImage(curtainCache, 0, 0, half * DPR, VH * DPR, w - half, 0, half, VH);
  ctx.drawImage(curtainCache, half * DPR, 0, half * DPR, VH * DPR, VW - w, 0, half, VH);
  // gold fringe and shadow along the edges
  ctx.fillStyle = ART.gold;
  ctx.fillRect(w - 2, 0, 2, VH);
  ctx.fillRect(VW - w, 0, 2, VH);
  const sh = ctx.createLinearGradient(w, 0, w + 26, 0);
  sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(w, 0, 26, VH);
  const sh2 = ctx.createLinearGradient(VW - w, 0, VW - w - 26, 0);
  sh2.addColorStop(0, 'rgba(0,0,0,0.5)'); sh2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh2;
  ctx.fillRect(VW - w - 26, 0, 26, VH);
}

// the title is a worn ivory plate, vertical, with veins of gold
function titleSprite() {
  if (titleCache) return titleCache;
  const size = Math.round(clamp(Math.min(VW, VH) * 0.2, 60, 150));
  const w = Math.ceil(size * 1.15), h = Math.ceil(size * 2.5);
  const c = document.createElement('canvas');
  c.width = w * DPR; c.height = h * DPR;
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  g.fillStyle = ART.ivory;
  g.font = `900 ${size}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillText('慣', w / 2, 0);
  g.fillText('性', w / 2, size * 1.15);
  // veins of gold where the glaze has cracked
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = ART.gold;
  g.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) {
    let x = hash2(i, 3) * w, y = hash2(i, 9) * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (hash2(i * 9 + k, 1) - 0.5) * size * 0.35; y += hash2(i * 9 + k, 2) * size * 0.26; g.lineTo(x, y); }
    g.stroke();
  }
  // wear
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.3;
  for (let i = 0; i < 260; i++) {
    g.fillRect(hash2(i, 5) * w, hash2(i, 6) * h, 1 + hash2(i, 7) * 2.4, 1 + hash2(i, 8) * 2.4);
  }
  titleCache = { c, w, h };
  return titleCache;
}

function drawPreview(o) {
  const P = G.player;
  ctx.strokeStyle = o.danger ? ART.threat : ART.glassHi;
  ctx.globalAlpha = 0.7;
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
    ctx.fillStyle = ART.glassHi;
    ctx.globalAlpha = 0.08;
    ctx.fillRect(X(o.path[i].x) + 2, Y(o.path[i].y) + 2, CELL - 4, CELL - 4);
  }
  // stop marks
  const stop = o.crash || o.clank;
  if (stop) {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = ART.threat;
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
    ctx.strokeStyle = ART.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(CX(k.e.x), CY(k.e.y), CELL * 0.45, 0, TAU);
    ctx.stroke();
  }
  // momentum after the move
  if (o.vx || o.vy) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = ART.ivory;
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

function drawHud() {
  const P = G.player;
  const y = Math.max(12, OY - 46);
  const big = Math.round(clamp(CELL * 0.66, 20, 30));
  // a dark plate behind the figures, so the curtain's trim never runs through them
  ctx.fillStyle = 'rgba(14,8,9,0.8)';
  ctx.fillRect(OX - 7, y - 9, CELL * N + 14, big + 28);
  ctx.strokeStyle = ART.goldDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(OX - 7, y - 9, CELL * N + 14, big + 28);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = ART.ivory;
  ctx.font = `700 ${big}px ${SERIF}`;
  ctx.fillText(String(G.score), OX, y);
  const sw = ctx.measureText(String(G.score)).width;
  if (G.best > 0) {
    ctx.fillStyle = G.score > G.best ? ART.gold : ART.goldDim;
    ctx.font = `500 ${Math.round(clamp(CELL * 0.27, 10, 13))}px ${SERIF}`;
    ctx.fillText('BEST ' + Math.max(G.best, G.score), OX, y + big + 3);
    ctx.font = `700 ${big}px ${SERIF}`;
  }
  if (G.streak >= 2) {
    ctx.fillStyle = ART.gold;
    ctx.font = `italic 700 ${Math.round(clamp(CELL * 0.46, 15, 22))}px ${SERIF}`;
    ctx.fillText('×' + G.streak, OX + sw + 10, y + 5);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = ART.gold;
  ctx.font = `600 ${Math.round(clamp(CELL * 0.42, 13, 19))}px ${SERIF}`;
  ctx.fillText('第' + kanjiNum(G.floor) + '幕', OX + CELL * N / 2, y + 5);
  // hearts: crimson jewels in gold settings
  const hr = clamp(CELL * 0.17, 5, 9);
  for (let i = 0; i < 3; i++) {
    const hx = OX + CELL * N - hr - i * (hr * 2.9), hy = y + hr + 4;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, TAU);
    if (i < P.hp) { ctx.fillStyle = '#c4202e'; ctx.fill(); ctx.strokeStyle = ART.gold; ctx.lineWidth = 2; ctx.stroke(); }
    else { ctx.strokeStyle = ART.goldDim; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1; }
  }
  // floor progress: a row of small gold lozenges
  const by = OY + CELL * N + 16;
  const total = G.quota;
  const dw = Math.min(12, (CELL * N) / Math.max(1, total) - 3);
  const startX = OX + CELL * N / 2 - (total * (dw + 3)) / 2;
  for (let i = 0; i < total; i++) {
    const cxp = startX + i * (dw + 3) + dw / 2;
    ctx.fillStyle = i < G.killed ? ART.gold : '#3b2c1c';
    ctx.beginPath();
    ctx.moveTo(cxp, by - 3.5); ctx.lineTo(cxp + dw / 2, by); ctx.lineTo(cxp, by + 3.5); ctx.lineTo(cxp - dw / 2, by);
    ctx.closePath();
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
  if (restartIfOver()) return;
  if (busy()) return;
  const m = markerAt(...toLocal(e));
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
  threats: ks => threatCells(ks),
  setSeed: s => { seed = s >>> 0; },
  newRun,
  skip: () => { if (G.tl) G.tl.end = -1; update(); },
};
})();
