(() => {
'use strict';

// ============================================================ canvas
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1, SCALE = 24;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = window.innerWidth;
  VH = window.innerHeight;
  canvas.width = Math.round(VW * DPR);
  canvas.height = Math.round(VH * DPR);
  SCALE = Math.max(16, Math.min(VW, VH) / 17);
}
window.addEventListener('resize', resize);
resize();

// ============================================================ utils
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const TAU = Math.PI * 2;
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
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
      master.gain.value = 0.55;
      master.connect(ac.destination);
      // cave echo: feedback delay through a lowpass
      const delay = ac.createDelay(1.0);
      delay.delayTime.value = 0.21;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1700;
      const fb = ac.createGain();
      fb.gain.value = 0.38;
      const wet = ac.createGain();
      wet.gain.value = 0.5;
      master.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(wet);
      wet.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }

  function out(g, pan) {
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
  }

  function tone(f, dur, o = {}) {
    if (!ac) return;
    const v = Math.max(0.0002, o.vol == null ? 0.2 : o.vol);
    if (v < 0.001) return;
    const t = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    out(g, o.pan);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(dur, o = {}) {
    if (!ac) return;
    const v = o.vol == null ? 0.2 : o.vol;
    if (v < 0.001) return;
    const t = ac.currentTime + (o.delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.freq || 800;
    bp.Q.value = o.q || 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(g);
    out(g, o.pan);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  return {
    ensure,
    ping(k) {
      const f = 1500 - 750 * k;
      tone(f, 0.22 + 0.5 * k, { vol: 0.16 + 0.12 * k, to: f * 0.72 });
      for (let i = 1; i <= 3; i++) {
        tone(f * 0.97, 0.18, { vol: 0.06 * (1 - i * 0.25) * (0.6 + k), delay: (0.11 + 0.12 * k) * i });
      }
    },
    step() { noise(0.035, { vol: 0.035, freq: 900, q: 2 }); },
    mstep(v, pan) {
      tone(58, 0.14, { type: 'triangle', vol: 0.5 * v, to: 38, pan });
      noise(0.06, { vol: 0.25 * v, freq: 180, pan });
    },
    shriek(v, pan) {
      tone(430, 0.55, { type: 'sawtooth', vol: 0.12 * v, to: 110, pan, attack: 0.02 });
      tone(452, 0.6, { type: 'square', vol: 0.05 * v, to: 95, pan, attack: 0.02 });
      noise(0.4, { vol: 0.1 * v, freq: 1400, q: 0.8, pan });
    },
    chime(v, pan) {
      tone(1046.5, 1.1, { vol: 0.09 * v, pan, attack: 0.01 });
      tone(1568, 1.2, { vol: 0.06 * v, pan, delay: 0.09, attack: 0.01 });
    },
    heart(v) {
      tone(62, 0.13, { vol: 0.5 * v, to: 44 });
      tone(58, 0.13, { vol: 0.35 * v, to: 42, delay: 0.17 });
    },
    death() {
      noise(1.4, { vol: 0.45, freq: 320, q: 0.6 });
      tone(120, 1.3, { type: 'sawtooth', vol: 0.18, to: 28 });
      tone(400, 0.5, { type: 'sawtooth', vol: 0.12, to: 90 });
    },
    crystal(v, pan) {
      [1760, 2217.5, 2637].forEach((f, i) => tone(f, 1.6, { vol: 0.05 * v, pan, delay: i * 0.03, attack: 0.01 }));
    },
    splash() {
      noise(0.22, { vol: 0.16, freq: 1300, q: 0.7 });
      tone(380, 0.12, { vol: 0.05, to: 900 });
    },
    breath(v, pan) { noise(0.6, { vol: 0.07 * v, freq: 380, q: 1.5, pan }); },
    alarm(v, pan) {
      for (let i = 0; i < 4; i++) tone(i % 2 ? 620 : 830, 0.16, { type: 'square', vol: 0.07 * v, pan, delay: i * 0.15 });
    },
    descend() {
      [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.7, { vol: 0.09, delay: i * 0.09 }));
    },
  };
})();

// ============================================================ state
const G = {
  mw: 0, mh: 0, grid: null,
  player: null, exit: null, monsters: [],
  waves: [], fx: [], mem: new Map(),
  depth: 1, best: 1, state: 'play', stateT: 0, now: 0,
  cam: { x: 0, y: 0 }, chimeT: 1.5, lastChime: -10, heartT: 0,
  titleT: 0, fade: 1, killer: null, danger: 0,
};

try { G.best = Math.max(1, parseInt(localStorage.getItem('zankyo.best') || '1', 10) || 1); } catch (e) { /* ignore */ }
function saveBest() {
  try { localStorage.setItem('zankyo.best', String(G.best)); } catch (e) { /* ignore */ }
}

// ============================================================ map
function isWall(x, y) {
  if (x < 0 || y < 0 || x >= G.mw || y >= G.mh) return true;
  return G.grid[y * G.mw + x] === 1;
}
function solidAt(x, y) { return isWall(Math.floor(x), Math.floor(y)); }

function bfs(grid, mw, mh, sx, sy) {
  const d = new Int32Array(mw * mh).fill(-1);
  const q = new Int32Array(mw * mh);
  let h = 0, t = 0;
  const s = sy * mw + sx;
  if (grid[s] === 1) return d;
  d[s] = 0;
  q[t++] = s;
  while (h < t) {
    const c = q[h++];
    const cx = c % mw, cy = (c / mw) | 0;
    const nd = d[c] + 1;
    if (cx > 0 && grid[c - 1] !== 1 && d[c - 1] < 0) { d[c - 1] = nd; q[t++] = c - 1; }
    if (cx < mw - 1 && grid[c + 1] !== 1 && d[c + 1] < 0) { d[c + 1] = nd; q[t++] = c + 1; }
    if (cy > 0 && grid[c - mw] !== 1 && d[c - mw] < 0) { d[c - mw] = nd; q[t++] = c - mw; }
    if (cy < mh - 1 && grid[c + mw] !== 1 && d[c + mw] < 0) { d[c + mw] = nd; q[t++] = c + mw; }
  }
  return d;
}

function genCave(mw, mh) {
  let g = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const border = x === 0 || y === 0 || x === mw - 1 || y === mh - 1;
      g[y * mw + x] = border || Math.random() < 0.46 ? 1 : 0;
    }
  }
  for (let it = 0; it < 5; it++) {
    const n = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (x === 0 || y === 0 || x === mw - 1 || y === mh - 1) { n[y * mw + x] = 1; continue; }
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += g[(y + dy) * mw + x + dx];
        n[y * mw + x] = c >= 5 ? 1 : 0;
      }
    }
    g = n;
  }
  // keep only the largest connected region
  const region = new Int32Array(mw * mh).fill(-1);
  let bestId = -1, bestSize = 0, id = 0;
  const q = new Int32Array(mw * mh);
  for (let i = 0; i < mw * mh; i++) {
    if (g[i] !== 0 || region[i] >= 0) continue;
    let h = 0, t = 0;
    q[t++] = i;
    region[i] = id;
    while (h < t) {
      const c = q[h++];
      const nb = [c - 1, c + 1, c - mw, c + mw];
      for (const k of nb) {
        if (k >= 0 && k < mw * mh && g[k] === 0 && region[k] < 0) { region[k] = id; q[t++] = k; }
      }
    }
    if (t > bestSize) { bestSize = t; bestId = id; }
    id++;
  }
  for (let i = 0; i < mw * mh; i++) if (g[i] === 0 && region[i] !== bestId) g[i] = 1;
  return { g, size: bestSize };
}

function open8(g, mw, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[(y + dy) * mw + x + dx] !== 0) return false;
  return true;
}

function genLevel(depth) {
  const mw = Math.min(110, 44 + depth * 7);
  const mh = Math.min(76, 32 + depth * 5);
  const nMon = Math.min(11, depth + (depth >= 3 ? 1 : 0));
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const { g, size } = genCave(mw, mh);
    if (size < mw * mh * 0.35) continue;
    const cand = [];
    for (let y = 1; y < mh - 1; y++) for (let x = 1; x < mw - 1; x++) if (g[y * mw + x] === 0 && open8(g, mw, x, y)) cand.push([x, y]);
    if (cand.length < 20) continue;
    const s = cand[(Math.random() * cand.length) | 0];
    const d = bfs(g, mw, mh, s[0], s[1]);
    let e = s, ed = 0;
    for (const c of cand) { const v = d[c[1] * mw + c[0]]; if (v > ed) { ed = v; e = c; } }
    // monsters: far enough from the start, apart from each other
    const shuffled = shuffle(cand.slice());
    const mons = [];
    for (const c of shuffled) {
      if (mons.length >= nMon) break;
      const v = d[c[1] * mw + c[0]];
      if (v < 18) continue;
      if (dist(c[0], c[1], e[0], e[1]) < 3) continue;
      if (mons.some(m => dist(m[0], m[1], c[0], c[1]) < 7)) continue;
      mons.push(c);
    }
    // sentinels (B4+): rooted, they cry out when they hear something
    const sents = [];
    if (depth >= 4) {
      const nS = Math.min(3, 1 + Math.floor((depth - 4) / 2));
      for (const c of shuffled) {
        if (sents.length >= nS) break;
        if (d[c[1] * mw + c[0]] < 12) continue;
        if (dist(c[0], c[1], e[0], e[1]) < 5) continue;
        if (mons.some(m => dist(m[0], m[1], c[0], c[1]) < 5)) continue;
        if (sents.some(m => dist(m[0], m[1], c[0], c[1]) < 12)) continue;
        sents.push(c);
      }
    }
    // crystals (B2+): wall faces that ring back when sound hits them
    const crystals = [];
    if (depth >= 2) {
      const nC = Math.min(7, 2 + Math.floor(depth / 2));
      const faces = [];
      for (let y = 1; y < mh - 1; y++) {
        for (let x = 1; x < mw - 1; x++) {
          if (g[y * mw + x] !== 1) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const fi = (y + dy) * mw + x + dx;
            if (g[fi] === 0 && d[fi] >= 6) { faces.push([x, y, dx, dy]); break; }
          }
        }
      }
      for (const f of shuffle(faces)) {
        if (crystals.length >= nC) break;
        if (crystals.some(c => dist(c[0], c[1], f[0], f[1]) < 9)) continue;
        crystals.push(f);
      }
    }
    // water (B3+): pools that splash loudly underfoot
    if (depth >= 3) {
      const nW = Math.min(6, depth - 1);
      let made = 0;
      for (const c of shuffled) {
        if (made >= nW) break;
        if (dist(c[0], c[1], s[0], s[1]) < 7 || dist(c[0], c[1], e[0], e[1]) < 4) continue;
        const R = rand(1.8, 3.4);
        for (let y = Math.floor(c[1] - R); y <= c[1] + R; y++) {
          for (let x = Math.floor(c[0] - R); x <= c[0] + R; x++) {
            if (x < 1 || y < 1 || x >= mw - 1 || y >= mh - 1) continue;
            const i = y * mw + x;
            if (g[i] === 0 && dist(x, y, c[0], c[1]) <= R && dist(x, y, s[0], s[1]) >= 3 && dist(x, y, e[0], e[1]) >= 2) g[i] = 2;
          }
        }
        made++;
      }
    }
    const score = ed + mons.length * 10;
    const lvl = { g, mw, mh, s, e, mons, sents, crystals, score };
    if (!best || score > best.score) best = lvl;
    if (ed >= (mw + mh) * 0.5 && mons.length >= nMon) return lvl;
  }
  return best;
}

// ============================================================ geometry
let RC_SIDE = 0, RC_TILE = -1;
function raycast(ox, oy, dx, dy, maxD, onTile) {
  let mx = Math.floor(ox), my = Math.floor(oy);
  const ddx = dx === 0 ? Infinity : Math.abs(1 / dx);
  const ddy = dy === 0 ? Infinity : Math.abs(1 / dy);
  let stepX, stepY, sideX, sideY;
  if (dx < 0) { stepX = -1; sideX = (ox - mx) * ddx; } else { stepX = 1; sideX = dx === 0 ? Infinity : (mx + 1 - ox) * ddx; }
  if (dy < 0) { stepY = -1; sideY = (oy - my) * ddy; } else { stepY = 1; sideY = dy === 0 ? Infinity : (my + 1 - oy) * ddy; }
  for (let i = 0; i < 400; i++) {
    let d, side;
    if (sideX < sideY) { d = sideX; sideX += ddx; mx += stepX; side = 0; } else { d = sideY; sideY += ddy; my += stepY; side = 1; }
    if (d > maxD) return -1;
    if (isWall(mx, my)) {
      RC_SIDE = side;
      RC_TILE = mx >= 0 && my >= 0 && mx < G.mw && my < G.mh ? my * G.mw + mx : -1;
      return d;
    }
    if (onTile) onTile(mx, my, d);
  }
  return -1;
}

function los(x0, y0, x1, y1) {
  const d = dist(x0, y0, x1, y1);
  if (d < 1e-4) return true;
  return raycast(x0, y0, (x1 - x0) / d, (y1 - y0) / d, d) < 0;
}

function collides(x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isWall(tx, ty)) continue;
      // circle vs tile box
      const cx = clamp(x, tx, tx + 1), cy = clamp(y, ty, ty + 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
    }
  }
  return false;
}

function moveEntity(e, dx, dy) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.1));
  const sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (!collides(e.x + sx, e.y, e.r)) e.x += sx;
    if (!collides(e.x, e.y + sy, e.r)) e.y += sy;
  }
}

// ============================================================ sound waves
// kind 0: player sound (pale), 1: exit chime (teal), 2: crystal (violet)
// Sound bounces off rock: reflected echoes arrive later and fainter.
function emitWave(x, y, o) {
  const maxR = o.maxR;
  const bounces = o.bounces == null ? 2 : o.bounces;
  const rays = Math.max(24, Math.ceil(TAU * maxR * 4.5));
  const off = Math.random() * TAU;
  const hits = [];
  const water = G.hasWater ? new Map() : null;
  let base = 0;
  const onTile = water ? (tx, ty, dd) => {
    const k = ty * G.mw + tx;
    if (G.grid[k] !== 2) return;
    const v = base + dd;
    if (!water.has(k) || water.get(k) > v) water.set(k, v);
  } : null;
  for (let i = 0; i < rays; i++) {
    const a = off + (i / rays) * TAU;
    let px = x, py = y, dx = Math.cos(a), dy = Math.sin(a), s = 1;
    base = 0;
    for (let b = 0; b <= bounces; b++) {
      const d = raycast(px, py, dx, dy, maxR - base, onTile);
      if (d < 0) break;
      const hx = px + dx * d, hy = py + dy * d;
      base += d;
      hits.push({ x: hx, y: hy, d: base, s, side: RC_SIDE, tile: RC_TILE });
      if (RC_SIDE === 0) dx = -dx; else dy = -dy;
      px = hx + dx * 1e-3;
      py = hy + dy * 1e-3;
      s *= 0.5;
    }
  }
  if (water) for (const [k, d] of water) hits.push({ water: true, tile: k, d });
  hits.sort((a, b) => a.d - b.d);
  G.waves.push({
    x, y, maxR, r: 0, speed: o.speed, strength: o.strength, kind: o.kind,
    alerts: !!o.alerts, reveals: o.reveals !== false, ring: o.ring == null ? 1 : o.ring,
    resonate: !!o.resonate, src: o.src || null, color: o.color || null,
    hits, idx: 0, done: new Set(),
  });
}

function memAlpha(e) {
  const a = e.s * Math.exp(-(G.now - e.t) / 2.4);
  return a;
}

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function addMem(x, y, kind, s, side) {
  const qx = Math.floor(x * 4), qy = Math.floor(y * 4);
  const key = qx * 4096 + qy;
  const e = G.mem.get(key);
  if (!e) {
    // rough rock surface: a fixed jitter per spot
    const jx = (hash2(qx, qy) - 0.5) * 0.16, jy = (hash2(qy + 911, qx) - 0.5) * 0.16;
    G.mem.set(key, { x: x + jx, y: y + jy, t: G.now, s, k: kind, side });
    return;
  }
  if (s >= memAlpha(e)) { e.t = G.now; e.s = s; e.k = kind; }
}

// rock body behind a heard surface
function markRock(tile, s) {
  if (tile < 0) return;
  const cur = G.rockS[tile] * Math.exp(-(G.now - G.rockT[tile]) / 2.4);
  if (G.rockT[tile] < 0 || s >= cur) { G.rockT[tile] = G.now; G.rockS[tile] = s; }
}

function ringCrystal(c) {
  if (c.cd > 0) return;
  c.cd = 3;
  c.pend = 0.3;
}

function updateCrystals(dt) {
  for (const c of G.crystals) {
    c.cd -= dt;
    if (c.pend > 0) {
      c.pend -= dt;
      if (c.pend <= 0 && G.state === 'play') {
        c.lastRing = G.now;
        markRock(c.tile, 1);
        emitWave(c.ox, c.oy, { maxR: 8, speed: 12, strength: 0.85, kind: 2, alerts: true, resonate: true, src: c, color: '#b48cff' });
        ring(c.ox, c.oy, 0.1, 1.6, 0.6, '#b48cff', 0.9, 2);
        const sn = soundAt(c.ox, c.oy, 30);
        Sfx.crystal(Math.max(0.15, sn.v), sn.pan);
      }
    }
  }
}

function updateWaves(dt) {
  for (const w of G.waves) {
    w.r += w.speed * dt;
    while (w.idx < w.hits.length && w.hits[w.idx].d <= w.r) {
      const h = w.hits[w.idx++];
      if (h.water) { G.waterT[h.tile] = G.now; continue; }
      const st = w.strength * h.s;
      addMem(h.x, h.y, w.kind, st, h.side);
      markRock(h.tile, st);
      if (w.resonate && h.s >= 0.5) {
        const c = G.crystalAt.get(h.tile);
        if (c && c !== w.src) ringCrystal(c);
      }
    }
    if (G.state !== 'play') continue;
    const r = Math.min(w.r, w.maxR);
    for (const m of G.monsters) {
      if (w.done.has(m)) continue;
      if (dist(w.x, w.y, m.x, m.y) > r) continue;
      w.done.add(m);
      if (w.reveals && los(w.x, w.y, m.x, m.y)) reveal(m, w.strength);
      if (w.alerts) hear(m, w.x, w.y);
    }
  }
  G.waves = G.waves.filter(w => w.r < w.maxR);
}

function ring(x, y, r0, r1, dur, color, a, w) {
  G.fx.push({ x, y, r0, r1, dur, color, a, w: w || 1.5, t: 0 });
}

// ============================================================ level
function newLevel() {
  const L = genLevel(G.depth);
  G.mw = L.mw; G.mh = L.mh; G.grid = L.g;
  G.player = {
    x: L.s[0] + 0.5, y: L.s[1] + 0.5, r: 0.27, vx: 0, vy: 0,
    stepAcc: 0, charging: false, chargeT: 0, chargeSrc: null,
  };
  G.exit = { x: L.e[0] + 0.5, y: L.e[1] + 0.5 };
  const hunt = Math.min(3.45, 2.75 + 0.12 * G.depth);
  const mk = (c, kind) => ({
    kind, x: c[0] + 0.5, y: c[1] + 0.5, r: kind === 'sentinel' ? 0.4 : 0.32, state: 'idle', timer: rand(0.5, 5),
    tx: 0, ty: 0, flow: null, flowKey: -1, stepAcc: 0, senseT: 0, stuckT: 0, breathT: rand(0, 1.5), cd: 0,
    seenT: -99, seenX: 0, seenY: 0, seenA: 0, huntSpeed: hunt * rand(0.94, 1.04), face: rand(0, TAU),
  });
  G.monsters = L.mons.map(c => mk(c, 'stalker')).concat(L.sents.map(c => mk(c, 'sentinel')));
  const n = L.mw * L.mh;
  G.rockT = new Float32Array(n).fill(-1);
  G.rockS = new Float32Array(n);
  G.waterT = new Float32Array(n).fill(-1);
  G.hasWater = false;
  for (let i = 0; i < n; i++) if (L.g[i] === 2) { G.hasWater = true; break; }
  G.crystalAt = new Map();
  G.crystals = L.crystals.map(f => {
    const [tx, ty, dx, dy] = f;
    const c = {
      tile: ty * L.mw + tx, x: tx + 0.5 + dx * 0.5, y: ty + 0.5 + dy * 0.5,
      ox: tx + 0.5 + dx * 0.8, oy: ty + 0.5 + dy * 0.8, dx, dy, cd: 0, pend: 0, lastRing: -99,
    };
    G.crystalAt.set(c.tile, c);
    return c;
  });
  G.trail = [];
  G.waves = [];
  G.fx = [];
  G.mem = new Map();
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  G.chimeT = 1.2;
  G.lastChime = -10;
  G.state = 'play';
  G.stateT = 0;
  G.killer = null;
  // waking up: a soft breath that shows the surroundings
  emitWave(G.player.x, G.player.y, { maxR: 7, speed: 9, strength: 0.85, kind: 0, alerts: false });
}

function newRun() {
  G.depth = 1;
  pointer.clear();
  newLevel();
  G.fade = 1;
}

// ============================================================ monsters
function setTarget(m, x, y) {
  m.tx = x; m.ty = y;
  const tx = clamp(Math.floor(x), 0, G.mw - 1), ty = clamp(Math.floor(y), 0, G.mh - 1);
  const key = ty * G.mw + tx;
  if (key !== m.flowKey) {
    m.flow = bfs(G.grid, G.mw, G.mh, tx, ty);
    m.flowKey = key;
  }
}

function reveal(m, a) {
  m.seenT = G.now;
  m.seenX = m.x;
  m.seenY = m.y;
  m.seenA = Math.max(0.35, Math.min(1, a));
}

function soundAt(x, y, range) {
  const p = G.player;
  const d = dist(x, y, p.x, p.y);
  const v = clamp(1 - d / range, 0, 1);
  return { v: v * v, pan: clamp((x - p.x) / 9, -1, 1) };
}

function hear(m, x, y) {
  if (m.kind === 'sentinel') {
    // a rooted listener: it cries out and everything nearby comes to the sound
    if (m.cd > 0) return;
    m.cd = 2.5;
    ring(m.x, m.y, 0.2, 13, 1.5, '#ffa040', 0.85, 2.5);
    ring(m.x, m.y, 0.2, 4, 0.8, '#ffa040', 0.9, 2);
    reveal(m, 1);
    const s = soundAt(m.x, m.y, 34);
    Sfx.alarm(Math.max(0.2, s.v), s.pan);
    for (const o of G.monsters) {
      if (o.kind !== 'sentinel' && dist(o.x, o.y, m.x, m.y) <= 13) hear(o, x, y);
    }
    return;
  }
  if (m.state !== 'hunt' && m.state !== 'alert') {
    // freezes for a moment before it charges
    ring(m.x, m.y, 0.2, 3.2, 0.9, '#ff3b3b', 0.9, 2);
    reveal(m, 1);
    const s = soundAt(m.x, m.y, 30);
    Sfx.shriek(Math.max(0.15, s.v), s.pan);
    m.state = 'alert';
    m.timer = 0.75;
  }
  m.stuckT = 0;
  setTarget(m, x, y);
}

function followPath(m, speed, dt) {
  if (dist(m.x, m.y, m.tx, m.ty) < 0.2) return true;
  if (!m.flow) return true;
  const cx = Math.floor(m.x), cy = Math.floor(m.y);
  let gx, gy;
  if (cx === Math.floor(m.tx) && cy === Math.floor(m.ty)) {
    gx = m.tx; gy = m.ty;
  } else {
    let best = m.flow[cy * G.mw + cx];
    if (best < 0) best = 1e9;
    let bx = -1, by = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (isWall(nx, ny)) continue;
        if (dx && dy && (isWall(cx + dx, cy) || isWall(cx, cy + dy))) continue;
        const v = m.flow[ny * G.mw + nx];
        if (v >= 0 && v < best) { best = v; bx = nx; by = ny; }
      }
    }
    if (bx < 0) return true;
    gx = bx + 0.5; gy = by + 0.5;
  }
  const dx = gx - m.x, dy = gy - m.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-4) return false;
  const s = Math.min(speed * dt, L);
  const ox = m.x, oy = m.y;
  moveEntity(m, (dx / L) * s, (dy / L) * s);
  const moved = dist(ox, oy, m.x, m.y);
  m.face = Math.atan2(dy, dx);
  if (moved < speed * dt * 0.2) m.stuckT += dt; else m.stuckT = 0;
  m.stepAcc += moved;
  const stride = m.state === 'hunt' ? 0.75 : 0.85;
  if (m.stepAcc >= stride) {
    m.stepAcc -= stride;
    const loud = m.state === 'hunt';
    const wet = G.grid[Math.floor(m.y) * G.mw + Math.floor(m.x)] === 2;
    if (wet) ring(m.x, m.y, 0.15, loud ? 2.4 : 1.8, 0.9, '#4aa3ff', 0.5, 1.2);
    ring(m.x, m.y, 0.15, loud ? 1.5 : 1.2, loud ? 0.7 : 0.9, '#ff4a3d', loud ? 0.55 : 0.38, 1.2);
    const sn = soundAt(m.x, m.y, loud ? 16 : 11);
    Sfx.mstep(sn.v * (loud ? 1 : 0.6), sn.pan);
  }
  return m.stuckT > 1.2;
}

function randomWanderTarget(m) {
  for (let i = 0; i < 25; i++) {
    const x = Math.floor(m.x + rand(-7, 7)), y = Math.floor(m.y + rand(-7, 7));
    if (!isWall(x, y)) return [x + 0.5, y + 0.5];
  }
  return null;
}

function updateMonsters(dt) {
  const p = G.player;
  let nearest = Infinity;
  for (const m of G.monsters) {
    const dp = dist(m.x, m.y, p.x, p.y);
    if (dp < m.r + p.r - 0.04) { die(m); return; }
    m.senseT -= dt;
    m.cd -= dt;
    m.breathT -= dt;
    if (m.kind === 'sentinel') {
      if (dp < 1.25) hear(m, p.x, p.y);
      if (dp < 7 && m.breathT <= 0) {
        m.breathT = rand(1.6, 2.2);
        ring(m.x, m.y, 0.2, 1.1, 1.3, '#ffa040', 0.12 + 0.35 * (1 - dp / 7), 1);
      }
      continue;
    }
    const active = m.state === 'hunt' || m.state === 'search' || m.state === 'alert';
    if (active) nearest = Math.min(nearest, dp);
    // a presence felt up close, even when it keeps still
    if (!active && dp < 5.5 && m.breathT <= 0) {
      m.breathT = rand(1.2, 1.8);
      const k = 1 - dp / 5.5;
      ring(m.x, m.y, 0.1, 0.8, 1.1, '#ff4a3d', 0.12 + 0.3 * k, 1);
      const sn = soundAt(m.x, m.y, 6);
      Sfx.breath(sn.v, sn.pan);
    }
    if (active && dp < 2.3 && m.senseT <= 0 && los(m.x, m.y, p.x, p.y)) {
      m.senseT = 0.25;
      if (m.state === 'search') hear(m, p.x, p.y); else setTarget(m, p.x, p.y);
    } else if (!active && dp < 1.25) {
      hear(m, p.x, p.y);
    }
    switch (m.state) {
      case 'idle':
        m.timer -= dt;
        if (m.timer <= 0) {
          const t = randomWanderTarget(m);
          if (t) { m.state = 'wander'; m.stuckT = 0; setTarget(m, t[0], t[1]); } else m.timer = 2;
        }
        break;
      case 'wander':
        if (followPath(m, 0.95, dt)) { m.state = 'idle'; m.timer = rand(2, 6.5); }
        break;
      case 'alert':
        m.timer -= dt;
        m.face = Math.atan2(m.ty - m.y, m.tx - m.x);
        if (m.timer <= 0) m.state = 'hunt';
        break;
      case 'hunt':
        if (followPath(m, m.huntSpeed, dt)) { m.state = 'search'; m.timer = rand(2.2, 3.4); }
        break;
      case 'search':
        m.timer -= dt;
        m.face += dt * 2.4;
        if (m.timer <= 0) { m.state = 'idle'; m.timer = rand(1.5, 4); }
        break;
    }
  }
  G.danger = nearest;
}

function die(m) {
  G.state = 'dead';
  G.stateT = 0;
  G.killer = m;
  G.player.charging = false;
  ring(G.player.x, G.player.y, 0.2, 9, 1.6, '#ff2a2a', 0.9, 3);
  for (const o of G.monsters) reveal(o, 1);
  Sfx.death();
}

// ============================================================ player
const keys = new Set();
const pointer = {
  pend: new Map(), moveId: null, jx: 0, jy: 0,
  clear() { this.pend.clear(); this.moveId = null; this.jx = 0; this.jy = 0; },
};

function pingRadius(t) {
  const k = clamp(t / 1.1, 0, 1);
  return 3.2 + 12.8 * Math.pow(k, 1.4);
}

function startCharge(src) {
  const p = G.player;
  if (G.state !== 'play' || p.charging) return;
  p.charging = true;
  p.chargeT = 0;
  p.chargeSrc = src;
}

function releaseCharge(src) {
  const p = G.player;
  if (!p.charging || p.chargeSrc !== src) return;
  p.charging = false;
  if (G.state !== 'play') return;
  const R = pingRadius(p.chargeT);
  const k = clamp(p.chargeT / 1.1, 0, 1);
  emitWave(p.x, p.y, { maxR: R, speed: 15, strength: 1, kind: 0, alerts: true, resonate: true });
  ring(p.x, p.y, 0.1, 0.9 + k, 0.35, '#e8f6ff', 0.8, 2);
  Sfx.ping(k);
}

function cancelCharge(src) {
  const p = G.player;
  if (p.charging && p.chargeSrc === src) p.charging = false;
}

function updatePlayer(dt) {
  const p = G.player;
  let ix = 0, iy = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) ix -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) ix += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) iy -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) iy += 1;
  ix += pointer.jx;
  iy += pointer.jy;
  const L = Math.hypot(ix, iy);
  if (L > 1) { ix /= L; iy /= L; }
  if (p.charging) p.chargeT += dt;
  const speed = 3.6 * (p.charging ? 0.55 : 1);
  const k = Math.min(1, dt * 14);
  p.vx += (ix * speed - p.vx) * k;
  p.vy += (iy * speed - p.vy) * k;
  const ox = p.x, oy = p.y;
  moveEntity(p, p.vx * dt, p.vy * dt);
  const moved = dist(ox, oy, p.x, p.y);
  if (moved > 1e-4) {
    p.stepAcc += moved;
    if (p.stepAcc >= 0.9) {
      p.stepAcc = 0;
      const ti = Math.floor(p.y) * G.mw + Math.floor(p.x);
      if (G.grid[ti] === 2) {
        G.waterT[ti] = G.now;
        emitWave(p.x, p.y, { maxR: 4.6, speed: 9, strength: 0.6, kind: 0, alerts: true, ring: 0.9, bounces: 1, color: '#4aa3ff' });
        Sfx.splash();
      } else {
        emitWave(p.x, p.y, { maxR: 2.1, speed: 8, strength: 0.42, kind: 0, alerts: true, ring: 0.35, bounces: 0 });
        Sfx.step();
      }
      G.trail.push(p.x, p.y);
      if (G.trail.length > 6000) G.trail.splice(0, 2);
    }
  }
  if (dist(p.x, p.y, G.exit.x, G.exit.y) < 0.55) {
    G.state = 'descend';
    G.stateT = 0;
    p.charging = false;
    ring(G.exit.x, G.exit.y, 0.2, 6, 1.2, '#5dffc8', 0.9, 2.5);
    Sfx.descend();
  }
}

// ============================================================ update
function update(dt) {
  G.now += dt;
  G.stateT += dt;
  G.titleT += dt;
  if (G.state === 'play') {
    updatePlayer(dt);
    if (G.state === 'play') updateMonsters(dt);
    updateCrystals(dt);
    G.chimeT -= dt;
    if (G.chimeT <= 0 && G.state === 'play') {
      G.chimeT = 2.8;
      G.lastChime = G.now;
      emitWave(G.exit.x, G.exit.y, { maxR: 4.5, speed: 5, strength: 0.75, kind: 1, alerts: false, bounces: 1 });
      const s = soundAt(G.exit.x, G.exit.y, 40);
      Sfx.chime(Math.max(0.12, s.v), s.pan);
    }
    // heartbeat when something hunts nearby
    if (G.state === 'play' && G.danger < 8) {
      G.heartT -= dt;
      if (G.heartT <= 0) {
        const i = 1 - G.danger / 8;
        Sfx.heart(0.35 + 0.65 * i);
        G.heartT = 0.95 - 0.5 * i;
      }
    } else {
      G.heartT = 0;
    }
    G.fade = Math.max(0, G.fade - dt * 1.5);
  } else if (G.state === 'descend') {
    const p = G.player;
    p.x += (G.exit.x - p.x) * Math.min(1, dt * 6);
    p.y += (G.exit.y - p.y) * Math.min(1, dt * 6);
    G.fade = clamp((G.stateT - 0.5) / 0.8, 0, 1);
    if (G.stateT > 1.4) {
      G.depth++;
      if (G.depth > G.best) { G.best = G.depth; saveBest(); }
      newLevel();
      G.fade = 1;
    }
  } else if (G.state === 'dead') {
    G.danger = Infinity;
  }
  updateWaves(dt);
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.dur);
  const ck = Math.min(1, dt * 6);
  G.cam.x += (G.player.x - G.cam.x) * ck;
  G.cam.y += (G.player.y - G.cam.y) * ck;
}

// ============================================================ draw
function drawMonsterShape(x, y, rot, a, scale) {
  const n = 9;
  ctx.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const ang = rot + (i / (n * 2)) * TAU;
    const r = (i % 2 ? 0.2 : 0.42) * SCALE * scale;
    const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.globalAlpha = a * 0.55;
  ctx.fillStyle = '#5a0b0b';
  ctx.fill();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ff3f3f';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawSentinel(x, y, a, scale) {
  const r = SCALE * 0.45 * scale;
  ctx.globalAlpha = a * 0.5;
  ctx.fillStyle = '#4a2200';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#ffa040';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.65, r * 0.3, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffa040';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.16, 0, TAU);
  ctx.fill();
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#020305';
  ctx.fillRect(0, 0, VW, VH);
  if (!G.player) return;

  const ox = VW / 2 - G.cam.x * SCALE, oy = VH / 2 - G.cam.y * SCALE;
  const X = x => x * SCALE + ox, Y = y => y * SCALE + oy;

  const tx0 = Math.max(0, Math.floor(G.cam.x - VW / 2 / SCALE) - 1);
  const tx1 = Math.min(G.mw - 1, Math.ceil(G.cam.x + VW / 2 / SCALE) + 1);
  const ty0 = Math.max(0, Math.floor(G.cam.y - VH / 2 / SCALE) - 1);
  const ty1 = Math.min(G.mh - 1, Math.ceil(G.cam.y + VH / 2 / SCALE) + 1);

  // heard rock: stippled body, so the solid side of a surface is obvious
  const st = Math.max(1.3, SCALE * 0.055);
  ctx.fillStyle = '#8fa6ba';
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * G.mw + tx;
      const t = G.rockT[i];
      if (t < 0) continue;
      const ra = Math.max(0.16, G.rockS[i] * Math.exp(-(G.now - t) / 2.4) * 0.5);
      ctx.globalAlpha = ra * 0.55;
      ctx.fillStyle = '#26394b';
      ctx.fillRect(X(tx), Y(ty), SCALE + 0.5, SCALE + 0.5);
      ctx.fillStyle = '#8fa6ba';
      ctx.globalAlpha = ra;
      for (let k = 0; k < 7; k++) {
        const hx = 0.1 + 0.8 * hash2(tx * 5 + k, ty * 3 + 1), hy = 0.1 + 0.8 * hash2(ty * 5 + k + 77, tx * 7 + 3);
        ctx.fillRect(X(tx + hx) - st / 2, Y(ty + hy) - st / 2, st, st);
      }
    }
  }

  // heard water
  if (G.hasWater) {
    ctx.strokeStyle = '#4aa3ff';
    ctx.lineWidth = Math.max(1, SCALE * 0.04);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * G.mw + tx;
        const t = G.waterT[i];
        if (t < 0) continue;
        ctx.globalAlpha = Math.max(0.2, 0.75 * Math.exp(-(G.now - t) / 2.4));
        for (let k = 0; k < 2; k++) {
          const yy = Y(ty + 0.3 + k * 0.42), x0 = X(tx + 0.12 + k * 0.2), w = SCALE * 0.5;
          const ph = G.now * 2 + tx + ty * 1.7 + k;
          ctx.beginPath();
          ctx.moveTo(x0, yy);
          ctx.quadraticCurveTo(x0 + w * 0.25, yy - SCALE * 0.08 * Math.sin(ph), x0 + w * 0.5, yy);
          ctx.quadraticCurveTo(x0 + w * 0.75, yy + SCALE * 0.08 * Math.sin(ph), x0 + w, yy);
          ctx.stroke();
        }
      }
    }
  }

  // where you have walked
  ctx.fillStyle = '#d4ecff';
  ctx.globalAlpha = 0.16;
  const fs = Math.max(1.5, SCALE * 0.06);
  for (let i = 0; i < G.trail.length; i += 2) {
    const px = X(G.trail[i]), py = Y(G.trail[i + 1]);
    if (px < -4 || py < -4 || px > VW + 4 || py > VH + 4) continue;
    ctx.fillRect(px - fs / 2, py - fs / 2, fs, fs);
  }

  // remembered surfaces: short strokes along the rock face
  const ds = Math.max(1.6, SCALE * 0.085);
  const dl = ds * 2.6;
  const colors = ['#d4ecff', '#5dffc8', '#b48cff'];
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = colors[k];
    for (const e of G.mem.values()) {
      if (e.k !== k) continue;
      const px = X(e.x), py = Y(e.y);
      if (px < -4 || py < -4 || px > VW + 4 || py > VH + 4) continue;
      ctx.globalAlpha = Math.max(0.2, memAlpha(e));
      if (e.side === 0) ctx.fillRect(px - ds / 2, py - dl / 2, ds, dl);
      else ctx.fillRect(px - dl / 2, py - ds / 2, dl, ds);
    }
  }

  // crystals that have been heard
  for (const c of G.crystals) {
    if (G.rockT[c.tile] < 0) continue;
    const age = G.now - c.lastRing;
    const glow = age < 1.5 ? 1 - age / 1.5 : 0;
    const px = X(c.x), py = Y(c.y);
    if (glow > 0) {
      ctx.globalAlpha = 0.35 * glow;
      ctx.fillStyle = '#b48cff';
      ctx.beginPath();
      ctx.arc(px, py, SCALE * 1.1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.55 + 0.45 * glow;
    ctx.strokeStyle = '#c9a8ff';
    ctx.lineWidth = 1.5;
    const ang = Math.atan2(c.dy, c.dx);
    for (let k = -1; k <= 1; k++) {
      const a = ang + k * 0.55, L = SCALE * (k ? 0.32 : 0.45);
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(ang) * SCALE * 0.1, py - Math.sin(ang) * SCALE * 0.1);
      ctx.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
      ctx.stroke();
    }
  }

  // wave fronts
  ctx.lineWidth = 1.2;
  for (const w of G.waves) {
    const a = (1 - w.r / w.maxR) * 0.45 * w.strength * w.ring;
    if (a <= 0.005) continue;
    ctx.globalAlpha = a;
    ctx.strokeStyle = w.color || (w.kind === 1 ? '#5dffc8' : w.kind === 2 ? '#b48cff' : '#e8f6ff');
    ctx.beginPath();
    ctx.arc(X(w.x), Y(w.y), w.r * SCALE, 0, TAU);
    ctx.stroke();
  }

  // fx rings
  for (const f of G.fx) {
    const k = f.t / f.dur;
    const e = 1 - Math.pow(1 - k, 3);
    ctx.globalAlpha = f.a * (1 - k);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = f.w;
    ctx.beginPath();
    ctx.arc(X(f.x), Y(f.y), (f.r0 + (f.r1 - f.r0) * e) * SCALE, 0, TAU);
    ctx.stroke();
  }

  // exit
  {
    const ex = X(G.exit.x), ey = Y(G.exit.y);
    const pulse = 0.5 + 0.5 * Math.sin(G.now * 3);
    const s = SCALE * (0.22 + 0.05 * pulse);
    ctx.globalAlpha = 0.12 + 0.1 * pulse;
    ctx.fillStyle = '#5dffc8';
    ctx.beginPath();
    ctx.arc(ex, ey, SCALE * 0.8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#5dffc8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex, ey - s); ctx.lineTo(ex + s, ey); ctx.lineTo(ex, ey + s); ctx.lineTo(ex - s, ey);
    ctx.closePath();
    ctx.stroke();
  }

  // glimpses of monsters
  for (const m of G.monsters) {
    if (G.state === 'dead' && m === G.killer) continue;
    const age = G.now - m.seenT;
    if (age > 1.8) continue;
    const a = m.seenA * (1 - age / 1.8);
    if (m.kind === 'sentinel') drawSentinel(X(m.seenX), Y(m.seenY), a, 1);
    else drawMonsterShape(X(m.seenX), Y(m.seenY), m.face + age * 0.3, a, 1);
  }
  if (G.state === 'dead' && G.killer) {
    const m = G.killer;
    if (m.kind === 'sentinel') drawSentinel(X(m.x), Y(m.y), 1, 1.2);
    else drawMonsterShape(X(m.x), Y(m.y), G.now * 0.6, 1, 1.15 + 0.1 * Math.sin(G.now * 9));
  }

  // player
  const p = G.player;
  if (G.state !== 'dead') {
    const px = X(p.x), py = Y(p.y);
    const shrink = G.state === 'descend' ? Math.max(0, 1 - G.stateT / 0.9) : 1;
    const grd = ctx.createRadialGradient(px, py, 0, px, py, SCALE * 0.9);
    grd.addColorStop(0, 'rgba(220,240,255,0.22)');
    grd.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.globalAlpha = shrink;
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, SCALE * 0.9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f2fbff';
    ctx.beginPath();
    ctx.arc(px, py, SCALE * 0.17 * shrink, 0, TAU);
    ctx.fill();
    if (p.charging) {
      const R = pingRadius(p.chargeT);
      const k = clamp(p.chargeT / 1.1, 0, 1);
      ctx.globalAlpha = 0.18 + 0.2 * k;
      ctx.strokeStyle = '#e8f6ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(px, py, R * SCALE, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5 + 0.4 * k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, SCALE * (0.3 + 0.1 * Math.sin(G.now * 20) * k), -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.stroke();
    }
  }

  // exit direction hint when the chime is heard off screen
  {
    const age = G.now - G.lastChime;
    const ex = X(G.exit.x), ey = Y(G.exit.y);
    const off = ex < 0 || ey < 0 || ex > VW || ey > VH;
    if (off && age < 1.4 && G.state === 'play') {
      const cx = VW / 2, cy = VH / 2;
      const dx = ex - cx, dy = ey - cy;
      const m = 22;
      const t = Math.min((VW / 2 - m) / Math.abs(dx || 1e-6), (VH / 2 - m) / Math.abs(dy || 1e-6));
      const hx = cx + dx * t, hy = cy + dy * t;
      const ang = Math.atan2(dy, dx);
      const k = age / 1.4;
      ctx.strokeStyle = '#5dffc8';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = (1 - k) * (0.7 - i * 0.3);
        ctx.beginPath();
        ctx.arc(hx - Math.cos(ang) * 10, hy - Math.sin(ang) * 10, 10 + k * 14 + i * 7, ang - 0.6, ang + 0.6);
        ctx.stroke();
      }
    }
  }

  // danger vignette
  ctx.globalAlpha = 1;
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
  let red = 0;
  if (G.state === 'play' && G.danger < 8) red = (1 - G.danger / 8) * (0.55 + 0.25 * Math.sin(G.now * 8));
  if (G.state === 'dead') red = Math.max(0, 0.8 - G.stateT * 0.3);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(${Math.round(150 * red)},0,${Math.round(4 * (1 - red))},${0.6 + 0.25 * red})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);

  // fade
  if (G.fade > 0) {
    ctx.globalAlpha = G.fade;
    ctx.fillStyle = '#020305';
    ctx.fillRect(0, 0, VW, VH);
  }

  // HUD: floor
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#7f95a8';
  ctx.font = '600 15px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('B' + G.depth, 16, 14);

  // title, first moments only
  if (G.titleT < 5) {
    const a = G.titleT < 1 ? G.titleT : Math.max(0, 1 - (G.titleT - 2.5) / 2.5);
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = '#cfe6f5';
    ctx.font = `200 ${Math.round(Math.min(VW, VH) * 0.09)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('残響', VW / 2, VH * 0.28);
  }

  // death screen
  if (G.state === 'dead' && G.stateT > 0.7) {
    const a = clamp((G.stateT - 0.7) / 0.6, 0, 1);
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = '#020305';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff5a52';
    ctx.font = `300 ${Math.round(Math.min(VW, VH) * 0.12)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText('B' + G.depth, VW / 2, VH * 0.27);
    ctx.fillStyle = '#7f95a8';
    ctx.font = '500 15px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('BEST B' + G.best, VW / 2, VH * 0.27 + Math.min(VW, VH) * 0.1);
  }
  ctx.globalAlpha = 1;
}

// ============================================================ input
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter']);

function tryRestart() {
  if (G.state === 'dead' && G.stateT > 1.1) { newRun(); return true; }
  return false;
}

window.addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  Sfx.ensure();
  if (G.state === 'dead') { if (!e.repeat) tryRestart(); return; }
  keys.add(e.code);
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) startCharge('key');
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
  if (e.code === 'Space' || e.code === 'Enter') releaseCharge('key');
});
window.addEventListener('blur', () => {
  keys.clear();
  pointer.clear();
  if (G.player) G.player.charging = false;
});

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  canvas.focus();
  Sfx.ensure();
  if (G.state === 'dead') { tryRestart(); return; }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  pointer.pend.set(e.pointerId, { sx: e.clientX, sy: e.clientY, mode: 'tap' });
  startCharge('p' + e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  const pp = pointer.pend.get(e.pointerId);
  if (!pp) return;
  const dx = e.clientX - pp.sx, dy = e.clientY - pp.sy;
  if (pp.mode === 'tap' && Math.hypot(dx, dy) > 14 && pointer.moveId === null) {
    pp.mode = 'move';
    pointer.moveId = e.pointerId;
    cancelCharge('p' + e.pointerId);
  }
  if (pp.mode === 'move') {
    const R = 46;
    const L = Math.hypot(dx, dy);
    const k = L > R ? R / L : 1;
    pointer.jx = (dx * k) / R;
    pointer.jy = (dy * k) / R;
  }
});
function pointerEnd(e) {
  const pp = pointer.pend.get(e.pointerId);
  if (!pp) return;
  pointer.pend.delete(e.pointerId);
  if (pp.mode === 'move') {
    pointer.moveId = null;
    pointer.jx = 0;
    pointer.jy = 0;
  } else if (e.type === 'pointerup') {
    releaseCharge('p' + e.pointerId);
  } else {
    cancelCharge('p' + e.pointerId);
  }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

// ============================================================ loop
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

newRun();
G.fade = 1;
requestAnimationFrame(frame);

// test hook (read-only snapshot), used by automated checks
window.__zankyo = G;
window.__zankyoStep = update;
window.__zankyoPointer = pointer;
window.__zankyoEmit = emitWave;
})();
