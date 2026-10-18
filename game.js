(() => {
'use strict';

// ============================================================ canvas
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1, SCALE = 24;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  // size to what is actually shown (100vh on mobile Safari runs behind the toolbars)
  const r = canvas.getBoundingClientRect();
  VW = Math.round(r.width) || window.innerWidth;
  VH = Math.round(r.height) || window.innerHeight;
  canvas.width = Math.round(VW * DPR);
  canvas.height = Math.round(VH * DPR);
  SCALE = Math.max(16, Math.min(VW, VH) / 17);
  titleCache = null;
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
let titleCache = null;
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

// ============================================================ art direction
// Palette and forms follow the reference poster (design/zankyo-art.md):
// ink-blue black, bone white, cold teal, and crimson used only as thin lines.
const ART = {
  ink: '#02060a', bone: '#e9e2d0', boneDim: '#b9b3a2', rock: '#1d3d48', rockDot: '#c4dcd6',
  wall: '#dfe6da', teal: '#58f0d4', crim: '#e02a2a', crimDeep: '#9c1212', rust: '#d9663a',
  crystal: '#a9b4ff', water: '#4fb0c0',
};
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function kanjiNum(n) {
  if (n < 10) return KANJI_DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? KANJI_DIGITS[n % 10] : '');
  if (n < 100) return KANJI_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? KANJI_DIGITS[n % 10] : '');
  return String(n);
}

// film grain: one small noise tile, laid over the screen with a new offset every frame
const grainTile = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const im = g.createImageData(160, 160);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = Math.pow(Math.random(), 3) * 255;
    im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = Math.random() < 0.5 ? 255 : 90;
  }
  g.putImageData(im, 0, 0);
  return c;
})();
// the same, as sparse faint specks that can be laid over the screen with plain alpha (cheap)
const grainSpecks = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const im = g.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) {
    im.data[i] = 214; im.data[i + 1] = 226; im.data[i + 2] = 220;
    im.data[i + 3] = Math.pow(Math.random(), 5) * 36;
  }
  g.putImageData(im, 0, 0);
  return c;
})();
const WHALE_LEN = 1.7;     // tiles, snout to flukes
const whale = { a: 0, swim: 0, trail: [] };
function updateWhale(dt) {
  const p = G.player;
  if (!p) return;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 0.3) {
    const target = Math.atan2(p.vy, p.vx);
    let d = target - whale.a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    whale.a += d * Math.min(1, dt * 7);
  }
  whale.swim += dt * (2.2 + sp * 1.6);
  whale.sp = sp; whale.px = p.x; whale.py = p.y;
  // the body follows the path the whale swam, so a turn bends the whole animal
  const nx = p.x, ny = p.y;
  const tr = whale.trail, last = tr[tr.length - 1];
  if (last && Math.hypot(nx - last[0], ny - last[1]) > 3) tr.length = 0;     // a new floor: start afresh
  if (!last || Math.hypot(nx - last[0], ny - last[1]) > 0.03) tr.push([nx, ny]);
  let acc = 0;
  for (let i = tr.length - 1; i > 0; i--) {
    acc += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]);
    if (acc > WHALE_LEN * 1.4) { tr.splice(0, i - 1); break; }
  }
}

// drifting marine snow (screen space, with a little parallax against the camera)
const SNOW = Array.from({ length: 70 }, () => ({
  x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, ph: Math.random() * 6.28, r: Math.random() < 0.15 ? 1.6 : 0.9,
}));
let snowCamX = 0, snowCamY = 0, snowNow = 0;

// cracks that creep in from the screen edges when something hunts nearby
const CRACKS = (() => {
  const out = [];
  const rnd = (() => { let a = 20260414; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  for (let side = 0; side < 4; side++) {
    for (let n = 0; n < 5; n++) {
      // points are in unit space: u along the edge (0..1), v depth from the edge (0..1)
      const pts = [];
      let u = 0.06 + rnd() * 0.88, v = 0;
      const drift = (rnd() - 0.5) * 0.5;
      const len = 0.18 + rnd() * 0.3;
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        pts.push([u, v, rnd()]);
        v += len / steps * (0.7 + rnd() * 0.6);
        u += (drift / steps) + (rnd() - 0.5) * 0.035;
      }
      out.push({ side, pts, th: rnd(), w: 0.7 + rnd() * 1.1 });
    }
  }
  return out;
})();

function drawCracks(level, now) {
  if (level <= 0.02) return;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ART.crim;
  const m = Math.min(VW, VH);
  const pulse = 0.85 + 0.15 * Math.sin(now * 7);
  for (const c of CRACKS) {
    const f = clamp(level * 1.25 + 0.05 - c.th * 0.85, 0, 1);
    if (f <= 0.01) continue;
    const n = Math.max(2, Math.ceil(f * c.pts.length));
    const place = ([u, v]) => {
      const d = v * m;
      switch (c.side) {
        case 0: return [u * VW, d];
        case 1: return [VW - d, u * VH];
        case 2: return [u * VW, VH - d];
        default: return [d, u * VH];
      }
    };
    ctx.globalAlpha = clamp(0.2 + level * 0.5, 0, 0.8) * pulse;
    ctx.lineWidth = c.w * (0.8 + level * 0.6);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x, y] = place(c.pts[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    // fine serration along the crack, like the hair on the poster's tear
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const [x, y] = place(c.pts[i]);
      const [x0, y0] = place(c.pts[i - 1]);
      const tx = x - x0, ty = y - y0, L = Math.hypot(tx, ty) || 1;
      const nx = -ty / L, ny = tx / L, k = 4 + 9 * c.pts[i][2];
      ctx.moveTo(x, y); ctx.lineTo(x + nx * k + tx / L * 3, y + ny * k + ty / L * 3);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

// the whale, seen from straight above (a long, slim rorqual): a rounded snout, the widest part at the shoulders,
// a body that narrows to a thin tail stock, narrow swept flippers and small flukes. The spine follows
// the snout's path, so turns curve the whole body, and a wave runs from the head to the tail while it swims.
const WHALE_W = [[0, 0], [0.012, 0.03], [0.04, 0.047], [0.1, 0.062], [0.22, 0.08], [0.36, 0.086], [0.5, 0.074], [0.65, 0.048], [0.8, 0.027], [0.92, 0.014], [1, 0.011]];
function whaleHalfWidth(s) {
  for (let i = 1; i < WHALE_W.length; i++) {
    if (s <= WHALE_W[i][0]) {
      const [s0, w0] = WHALE_W[i - 1], [s1, w1] = WHALE_W[i], t = (s - s0) / (s1 - s0), e = t * t * (3 - 2 * t);
      return w0 + (w1 - w0) * (t * 0.5 + e * 0.5);
    }
  }
  return WHALE_W[WHALE_W.length - 1][1];
}
function drawWhale(len, swim, a, X, Y) {
  const L = len, tr = whale.trail;
  if (!tr.length) return;
  const M = 36;
  // the spine: from the snout (a little ahead of the player) back along the path the whale has swum
  const pts = [[whale.px + Math.cos(whale.a) * 0.25 * WHALE_LEN, whale.py + Math.sin(whale.a) * 0.25 * WHALE_LEN]];
  for (let i = tr.length - 1; i >= 0; i--) pts.push(tr[i]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const sp = [];
  let k = 1;
  for (let i = 0; i <= M; i++) {
    const dist = Math.pow(i / M, 1.35) * WHALE_LEN;
    while (k < pts.length - 1 && cum[k] < dist) k++;
    let x, y;
    if (pts.length < 2 || dist > cum[pts.length - 1]) {          // ran out of path: carry on straight back
      const over = dist - cum[pts.length - 1], q = pts[pts.length - 1], r = pts.length > 1 ? pts[pts.length - 2] : null;
      let dx = r ? q[0] - r[0] : -Math.cos(whale.a), dy = r ? q[1] - r[1] : -Math.sin(whale.a);
      const dl = Math.hypot(dx, dy) || 1;
      x = q[0] + dx / dl * over; y = q[1] + dy / dl * over;
    } else {
      const seg = cum[k] - cum[k - 1] || 1, u = (dist - cum[k - 1]) / seg;
      x = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u; y = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u;
    }
    sp.push([X(x), Y(y)]);
  }
  // a turn is a sweeping curve, not a corner: relax the spine (the snout stays put)
  for (let pass = 0; pass < 16; pass++) {
    for (let i = 1; i < M; i++) { sp[i][0] = (sp[i - 1][0] + sp[i][0] * 2 + sp[i + 1][0]) / 4; sp[i][1] = (sp[i - 1][1] + sp[i][1] * 2 + sp[i + 1][1]) / 4; }
  }
  // the swimming wave
  const amp = (0.018 + 0.04 * Math.min(1, (whale.sp || 0) / 3)) * L;
  const raw = sp.map(p => p.slice());
  for (let i = 1; i <= M; i++) {
    const t = i / M, p0 = raw[Math.max(0, i - 1)], p1 = raw[Math.min(M, i + 1)];
    let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const off = amp * Math.pow(t, 1.5) * Math.sin(swim - 4.2 * t);
    sp[i][0] += -ty * off; sp[i][1] += tx * off;
  }
  const left = [], right = [];
  for (let i = 0; i <= M; i++) {
    const p0 = sp[Math.max(0, i - 1)], p1 = sp[Math.min(M, i + 1)];
    let tx = p0[0] - p1[0], ty = p0[1] - p1[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;   // pointing head-ward
    const w = whaleHalfWidth(i === 0 ? 0 : Math.pow(i / M, 1.35)) * L;
    left.push([sp[i][0] - ty * w, sp[i][1] + tx * w]);
    right.push([sp[i][0] + ty * w, sp[i][1] - tx * w]);
  }
  // the tail: where it points
  const E = sp[M], Q = sp[M - 2];
  let bx = E[0] - Q[0], by = E[1] - Q[1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;   // away from the head
  const nxx = -by, nyy = bx;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = ART.bone;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i <= M; i++) ctx.lineTo(left[i][0], left[i][1]);
  const wl = left[M], wr = right[M];
  const tip = (sgn) => [E[0] + bx * 0.09 * L + nxx * sgn * 0.2 * L, E[1] + by * 0.09 * L + nyy * sgn * 0.2 * L];
  const tl2 = tip(1), tr2 = tip(-1), notch = [E[0] + bx * 0.035 * L, E[1] + by * 0.035 * L];
  ctx.quadraticCurveTo(E[0] + bx * 0.0 * L + nxx * 0.12 * L, E[1] + by * 0.0 * L + nyy * 0.12 * L, tl2[0], tl2[1]);
  ctx.quadraticCurveTo(E[0] + bx * 0.1 * L + nxx * 0.11 * L, E[1] + by * 0.1 * L + nyy * 0.11 * L, notch[0], notch[1]);
  ctx.quadraticCurveTo(E[0] + bx * 0.1 * L - nxx * 0.11 * L, E[1] + by * 0.1 * L - nyy * 0.11 * L, tr2[0], tr2[1]);
  ctx.quadraticCurveTo(E[0] + bx * 0.0 * L - nxx * 0.12 * L, E[1] + by * 0.0 * L - nyy * 0.12 * L, wr[0], wr[1]);
  for (let i = M - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  // flippers: narrow and swept back from the shoulders, drawn at the same moment as the body bends
  const fi = Math.round(M * Math.pow(0.36, 1 / 1.35));
  for (const [edge, sgn] of [[left, 1], [right, -1]]) {
    const base = edge[fi], b2 = edge[Math.min(M, fi + 3)];
    const P0 = sp[fi], P1 = sp[Math.min(M, fi + 2)];
    let hx = P0[0] - P1[0], hy = P0[1] - P1[1]; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;   // head-ward
    const ox = (base[0] - P0[0]), oy = (base[1] - P0[1]), ol = Math.hypot(ox, oy) || 1;
    const tipx = base[0] + (ox / ol) * 0.14 * L - hx * 0.22 * L, tipy = base[1] + (oy / ol) * 0.14 * L - hy * 0.22 * L;
    ctx.beginPath();
    ctx.moveTo(base[0], base[1]);
    ctx.quadraticCurveTo(base[0] + (ox / ol) * 0.1 * L - hx * 0.05 * L, base[1] + (oy / ol) * 0.1 * L - hy * 0.05 * L, tipx, tipy);
    ctx.quadraticCurveTo(b2[0] + (ox / ol) * 0.05 * L - hx * 0.12 * L, b2[1] + (oy / ol) * 0.05 * L - hy * 0.12 * L, b2[0], b2[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// crimson line-work, no fill: a ring of inward teeth with hair along its outer edge
function drawMonsterShape(x, y, rot, a, scale, seed) {
  const r = SCALE * 0.42 * scale;
  const n = 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineCap = 'round';
  // faint wide pass for glow, then the thin line
  for (const [lw, al] of [[SCALE * 0.12, 0.16], [Math.max(1.1, SCALE * 0.045), 1]]) {
    ctx.globalAlpha = a * al;
    ctx.strokeStyle = ART.crim;
    ctx.lineWidth = lw;
    ctx.beginPath();
    // an open ring: the jaw
    ctx.arc(0, 0, r, 0.35, TAU - 0.35);
    // inward teeth
    for (let i = 0; i < n; i++) {
      const ang = 0.5 + (i / (n - 1)) * (TAU - 1.0);
      const ln = r * (0.28 + 0.34 * hash2(i * 7 + (seed | 0), 13));
      ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
      ctx.lineTo(Math.cos(ang + 0.07) * (r - ln), Math.sin(ang + 0.07) * (r - ln));
    }
    ctx.stroke();
  }
  // hair along the outside
  ctx.globalAlpha = a * 0.75;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const ang = 0.5 + (i / 23) * (TAU - 1.0);
    const ln = r * (0.16 + 0.2 * hash2(i * 3 + 5, (seed | 0) + 9));
    ctx.moveTo(Math.cos(ang) * (r + 1), Math.sin(ang) * (r + 1));
    ctx.lineTo(Math.cos(ang + 0.1) * (r + ln), Math.sin(ang + 0.1) * (r + ln));
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// rooted listener: same hand as the rest, in rust so it never reads as a hunter
function drawSentinel(x, y, a, scale) {
  const r = SCALE * 0.45 * scale;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ART.rust;
  for (const [lw, al] of [[SCALE * 0.11, 0.14], [Math.max(1.1, SCALE * 0.04), 1]]) {
    ctx.globalAlpha = a * al;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.moveTo(x + r * 0.65, y);
    ctx.ellipse(x, y, r * 0.65, r * 0.3, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = a;
  ctx.fillStyle = ART.rust;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.15, 0, TAU);
  ctx.fill();
  ctx.lineCap = 'butt';
}

// the title is cut from a worn plate: a vertical mincho, grained away
function titleSprite() {
  if (titleCache) return titleCache;
  const size = Math.round(clamp(Math.min(VW, VH) * 0.17, 54, 150));
  const c = document.createElement('canvas');
  const w = Math.ceil(size * 1.2), h = Math.ceil(size * 2.5);
  c.width = w * DPR; c.height = h * DPR;
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  g.fillStyle = ART.bone;
  g.font = `900 ${size}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillText('残', w / 2, 0);
  g.fillText('響', w / 2, size * 1.15);
  g.globalCompositeOperation = 'destination-out';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 0.42;
  g.fillStyle = g.createPattern(grainTile, 'repeat');
  g.fillRect(0, 0, c.width, c.height);
  titleCache = { c, w, h };
  return titleCache;
}

// a small vertical run of text, top to bottom
function verticalText(str, x, y, size, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let yy = y;
  for (const ch of str) { ctx.fillText(ch, x, yy); yy += size * 1.15; }
  ctx.globalAlpha = 1;
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
      drone();
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }

  // deep water: a very low hum and a slow wash, always just under hearing
  function drone() {
    const sub = ac.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 46;
    const sg = ac.createGain();
    sg.gain.value = 0.035;
    sub.connect(sg);
    sg.connect(ac.destination);
    sub.start();
    const wash = ac.createBufferSource();
    wash.buffer = noiseBuf;
    wash.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const wg = ac.createGain();
    wg.gain.value = 0.03;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ac.createGain();
    lg.gain.value = 0.015;
    lfo.connect(lg);
    lg.connect(wg.gain);
    lfo.start();
    wash.connect(lp);
    lp.connect(wg);
    wg.connect(ac.destination);
    wash.start();
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
      // a lower voice under it, falling more slowly: closer to a whale's call
      tone(f * 0.5, 0.5 + 0.9 * k, { vol: 0.05 + 0.04 * k, to: f * 0.34, attack: 0.03 });
      for (let i = 1; i <= 3; i++) {
        tone(f * 0.97, 0.18, { vol: 0.06 * (1 - i * 0.25) * (0.6 + k), delay: (0.11 + 0.12 * k) * i });
      }
    },
    // a flick of the tail: a soft swish of moving water
    step() { noise(0.24, { vol: 0.03, freq: 260, q: 0.6 }); tone(170, 0.2, { vol: 0.018, to: 105 }); },
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
    // swimming through a plume of bubbles: a bubbling burble
    splash() {
      noise(0.32, { vol: 0.07, freq: 2300, q: 0.5 });
      for (let i = 0; i < 6; i++) {
        const f = 420 + Math.random() * 700;
        tone(f, 0.07, { vol: 0.045, to: f * 1.6, delay: i * 0.045 + Math.random() * 0.02 });
      }
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
        emitWave(c.ox, c.oy, { maxR: 8, speed: 12, strength: 0.85, kind: 2, alerts: true, resonate: true, src: c, color: ART.crystal });
        ring(c.ox, c.oy, 0.1, 1.6, 0.6, ART.crystal, 0.9, 2);
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
    ring(m.x, m.y, 0.2, 13, 1.5, ART.rust, 0.85, 2.5);
    ring(m.x, m.y, 0.2, 4, 0.8, ART.rust, 0.9, 2);
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
    ring(m.x, m.y, 0.2, 3.2, 0.9, ART.crim, 0.9, 2);
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
    if (wet) ring(m.x, m.y, 0.15, loud ? 2.4 : 1.8, 0.9, ART.water, 0.5, 1.2);
    ring(m.x, m.y, 0.15, loud ? 1.5 : 1.2, loud ? 0.7 : 0.9, '#d83a32', loud ? 0.55 : 0.38, 1.2);
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
        ring(m.x, m.y, 0.2, 1.1, 1.3, ART.rust, 0.12 + 0.35 * (1 - dp / 7), 1);
      }
      continue;
    }
    const active = m.state === 'hunt' || m.state === 'search' || m.state === 'alert';
    if (active) nearest = Math.min(nearest, dp);
    // a presence felt up close, even when it keeps still
    if (!active && dp < 5.5 && m.breathT <= 0) {
      m.breathT = rand(1.2, 1.8);
      const k = 1 - dp / 5.5;
      ring(m.x, m.y, 0.1, 0.8, 1.1, '#d83a32', 0.12 + 0.3 * k, 1);
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
  ring(G.player.x, G.player.y, 0.2, 9, 1.6, ART.crim, 0.9, 3);
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
  ring(p.x, p.y, 0.1, 0.9 + k, 0.35, ART.bone, 0.8, 2);
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
        emitWave(p.x, p.y, { maxR: 4.6, speed: 9, strength: 0.6, kind: 0, alerts: true, ring: 0.9, bounces: 1, color: ART.water });
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
    ring(G.exit.x, G.exit.y, 0.2, 6, 1.2, ART.teal, 0.9, 2.5);
    Sfx.descend();
  }
}

// ============================================================ update
function update(dt) {
  updateWhale(dt);
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
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1;
  // deep water: a faint lift of blue-green toward the middle, black at the edges
  const bg = ctx.createRadialGradient(VW / 2, VH * 0.55, 0, VW / 2, VH * 0.55, Math.max(VW, VH) * 0.7);
  bg.addColorStop(0, '#04101a');
  bg.addColorStop(0.55, '#020a10');
  bg.addColorStop(1, ART.ink);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VW, VH);
  if (!G.player) return;

  // marine snow
  {
    const dt = Math.min(0.1, Math.max(0, G.now - snowNow));
    snowNow = G.now;
    const dcx = (G.cam.x - snowCamX) * SCALE, dcy = (G.cam.y - snowCamY) * SCALE;
    snowCamX = G.cam.x; snowCamY = G.cam.y;
    ctx.fillStyle = ART.boneDim;
    for (const f of SNOW) {
      f.ph += dt * (0.4 + f.z);
      f.x += (-dcx * (0.25 + 0.3 * f.z)) / VW + Math.sin(f.ph) * 0.0004;
      f.y += (-dcy * (0.25 + 0.3 * f.z)) / VH + dt * 0.006 * f.z;
      f.x -= Math.floor(f.x); f.y -= Math.floor(f.y);
      ctx.globalAlpha = 0.1 + 0.2 * f.z;
      ctx.fillRect(f.x * VW, f.y * VH, f.r * f.z + 0.4, f.r * f.z + 0.4);
    }
    ctx.globalAlpha = 1;
  }

  const ox = VW / 2 - G.cam.x * SCALE, oy = VH / 2 - G.cam.y * SCALE;
  const X = x => x * SCALE + ox, Y = y => y * SCALE + oy;

  const tx0 = Math.max(0, Math.floor(G.cam.x - VW / 2 / SCALE) - 1);
  const tx1 = Math.min(G.mw - 1, Math.ceil(G.cam.x + VW / 2 / SCALE) + 1);
  const ty0 = Math.max(0, Math.floor(G.cam.y - VH / 2 / SCALE) - 1);
  const ty1 = Math.min(G.mh - 1, Math.ceil(G.cam.y + VH / 2 / SCALE) + 1);

  // heard rock: stippled body, so the solid side of a surface is obvious
  const st = Math.max(1.3, SCALE * 0.055);
  ctx.fillStyle = ART.rockDot;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * G.mw + tx;
      const t = G.rockT[i];
      if (t < 0) continue;
      const ra = Math.max(0.16, G.rockS[i] * Math.exp(-(G.now - t) / 2.4) * 0.5);
      ctx.globalAlpha = Math.min(0.85, ra * 1.0);
      ctx.fillStyle = ART.rock;
      ctx.fillRect(X(tx), Y(ty), SCALE + 0.5, SCALE + 0.5);
      ctx.fillStyle = ART.rockDot;
      ctx.globalAlpha = ra;
      for (let k = 0; k < 7; k++) {
        const hx = 0.1 + 0.8 * hash2(tx * 5 + k, ty * 3 + 1), hy = 0.1 + 0.8 * hash2(ty * 5 + k + 77, tx * 7 + 3);
        ctx.fillRect(X(tx + hx) - st / 2, Y(ty + hy) - st / 2, st, st);
      }
    }
  }

  // heard vents: columns of bubbles rising out of the floor, swelling as they come up
  if (G.hasWater) {
    ctx.lineWidth = Math.max(1, SCALE * 0.035);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * G.mw + tx;
        const t = G.waterT[i];
        if (t < 0) continue;
        const base = Math.max(0.2, 0.8 * Math.exp(-(G.now - t) / 2.4));
        for (let k = 0; k < 5; k++) {
          const ph = (G.now * (0.28 + 0.2 * hash2(tx * 3 + k, ty)) + hash2(tx + k * 9, ty * 5 + 2)) % 1;
          const hx = 0.12 + 0.76 * hash2(tx * 5 + k, ty * 3 + 1) + 0.05 * Math.sin(G.now * 2 + k + tx);
          const hy = 0.12 + 0.76 * hash2(ty * 5 + k + 77, tx * 7 + 3);
          const r = SCALE * (0.025 + 0.085 * ph);
          ctx.globalAlpha = base * Math.sin(Math.PI * Math.min(1, ph * 1.05)) ;
          ctx.strokeStyle = ART.water;
          ctx.beginPath(); ctx.arc(X(tx + hx), Y(ty + hy), r, 0, TAU); ctx.stroke();
          ctx.globalAlpha *= 0.7;
          ctx.fillStyle = '#d8f0f0';
          ctx.fillRect(X(tx + hx) - r * 0.45 - 0.5, Y(ty + hy) - r * 0.45 - 0.5, Math.max(1, r * 0.25), Math.max(1, r * 0.25));
        }
      }
    }
  }

  // where you have walked
  ctx.fillStyle = '#9fb8b4';
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
  const colors = [ART.wall, ART.teal, ART.crystal];
  const sp = Math.max(1.1, SCALE * 0.04);
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = colors[k];
    for (const e of G.mem.values()) {
      if (e.k !== k) continue;
      const px = X(e.x), py = Y(e.y);
      if (px < -4 || py < -4 || px > VW + 4 || py > VH + 4) continue;
      const al = Math.max(0.2, memAlpha(e));
      ctx.globalAlpha = al;
      if (e.side === 0) ctx.fillRect(px - ds / 2, py - dl / 2, ds, dl);
      else ctx.fillRect(px - dl / 2, py - ds / 2, dl, ds);
      // flecks thrown off the rock face, as on the poster's cliffs
      if (k === 0) {
        const qx = Math.floor(e.x * 4), qy = Math.floor(e.y * 4);
        ctx.globalAlpha = al * 0.8;
        for (let j = 0; j < 2; j++) {
          const fx = (hash2(qx + j * 31, qy + 7) - 0.5) * SCALE * 0.5, fy = (hash2(qy + j * 17, qx + 3) - 0.5) * SCALE * 0.5;
          ctx.fillRect(px + fx, py + fy, sp, sp);
        }
      }
    }
  }

  // crystals that have been heard
  for (const c of G.crystals) {
    if (G.rockT[c.tile] < 0) continue;
    const age = G.now - c.lastRing;
    const glow = age < 1.5 ? 1 - age / 1.5 : 0;
    const px = X(c.x), py = Y(c.y);
    if (glow > 0) {
      const cg = ctx.createRadialGradient(px, py, 0, px, py, SCALE * 1.5);
      cg.addColorStop(0, 'rgba(169,180,255,0.42)');
      cg.addColorStop(1, 'rgba(169,180,255,0)');
      ctx.globalAlpha = glow;
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(px, py, SCALE * 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.55 + 0.45 * glow;
    ctx.strokeStyle = '#d6dcff';
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

  // wave fronts: dotted rings, with fainter ones trailing behind (the reverberation)
  ctx.lineCap = 'round';
  for (const w of G.waves) {
    const a = (1 - w.r / w.maxR) * 0.5 * w.strength * w.ring;
    if (a <= 0.005) continue;
    ctx.strokeStyle = w.color || (w.kind === 1 ? ART.teal : w.kind === 2 ? ART.crystal : ART.bone);
    const trails = w.maxR > 4 && w.ring > 0.5 ? 3 : 1;
    for (let k = 0; k < trails; k++) {
      const rr = w.r - k * 0.9;
      if (rr <= 0.2) continue;
      ctx.globalAlpha = Math.min(1, a * 1.5) * (k === 0 ? 1 : 0.5 / k);
      ctx.lineWidth = k === 0 ? 2 : 1.3;
      ctx.setLineDash([0.1, k === 0 ? 5.5 : 7]);
      ctx.beginPath();
      ctx.arc(X(w.x), Y(w.y), rr * SCALE, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';

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
    const pulse = 0.5 + 0.5 * Math.sin(G.now * 2.4);
    const halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, SCALE * 1.3);
    halo.addColorStop(0, `rgba(88,240,212,${0.28 + 0.14 * pulse})`);
    halo.addColorStop(1, 'rgba(88,240,212,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ex, ey, SCALE * 1.3, 0, TAU);
    ctx.fill();
    // faint dotted rings drifting outward
    ctx.strokeStyle = ART.teal;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.setLineDash([0.1, 5]);
    for (let k = 0; k < 2; k++) {
      const ph = ((G.now * 0.35 + k * 0.5) % 1);
      ctx.globalAlpha = 0.5 * (1 - ph);
      ctx.beginPath();
      ctx.arc(ex, ey, SCALE * (0.25 + ph * 0.9), 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#d8fff6';
    ctx.beginPath();
    ctx.arc(ex, ey, SCALE * (0.1 + 0.02 * pulse), 0, TAU);
    ctx.fill();
  }

  // glimpses of monsters
  for (const m of G.monsters) {
    if (G.state === 'dead' && m === G.killer) continue;
    const age = G.now - m.seenT;
    if (age > 1.8) continue;
    const a = m.seenA * (1 - age / 1.8);
    if (m.kind === 'sentinel') drawSentinel(X(m.seenX), Y(m.seenY), a, 1);
    else drawMonsterShape(X(m.seenX), Y(m.seenY), m.face + age * 0.3, a, 1, G.monsters.indexOf(m) * 17 + 3);
  }
  if (G.state === 'dead' && G.killer) {
    const m = G.killer;
    if (m.kind === 'sentinel') drawSentinel(X(m.x), Y(m.y), 1, 1.2);
    else drawMonsterShape(X(m.x), Y(m.y), G.now * 0.6, 1, 1.9 + 0.12 * Math.sin(G.now * 9), G.monsters.indexOf(m) * 17 + 3);
  }

  // player
  const p = G.player;
  if (G.state !== 'dead') {
    const px = X(p.x), py = Y(p.y);
    const shrink = G.state === 'descend' ? Math.max(0, 1 - G.stateT / 0.9) : 1;
    const grd = ctx.createRadialGradient(px, py, 0, px, py, SCALE * 1.0);
    grd.addColorStop(0, 'rgba(233,226,208,0.2)');
    grd.addColorStop(1, 'rgba(233,226,208,0)');
    ctx.globalAlpha = shrink;
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, SCALE * 1.0, 0, TAU);
    ctx.fill();
    drawWhale(SCALE * WHALE_LEN * shrink, whale.swim, shrink, X, Y);
    if (p.charging) {
      const R = pingRadius(p.chargeT);
      const k = clamp(p.chargeT / 1.1, 0, 1);
      ctx.globalAlpha = 0.18 + 0.2 * k;
      ctx.strokeStyle = ART.bone;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.setLineDash([0.1, 6]);
      ctx.beginPath();
      ctx.arc(px, py, R * SCALE, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.5 + 0.4 * k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, SCALE * (0.62 + 0.1 * Math.sin(G.now * 20) * k), -Math.PI / 2, -Math.PI / 2 + TAU * k);
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
      ctx.strokeStyle = ART.teal;
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = (1 - k) * (0.7 - i * 0.3);
        ctx.beginPath();
        ctx.arc(hx - Math.cos(ang) * 10, hy - Math.sin(ang) * 10, 10 + k * 14 + i * 7, ang - 0.6, ang + 0.6);
        ctx.stroke();
      }
    }
  }

  // danger: a dark crimson vignette, and thin cracks creeping in from the edges
  ctx.globalAlpha = 1;
  let red = 0;
  if (G.state === 'play' && G.danger < 8) red = (1 - G.danger / 8) * (0.55 + 0.25 * Math.sin(G.now * 8));
  if (G.state === 'dead') red = Math.max(0.55, 0.95 - G.stateT * 0.2);
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(${Math.round(70 * red)},0,${Math.round(4 * (1 - red))},${0.62 + 0.2 * red})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);
  drawCracks(red, G.now);

  // fade
  if (G.fade > 0) {
    ctx.globalAlpha = G.fade;
    ctx.fillStyle = ART.ink;
    ctx.fillRect(0, 0, VW, VH);
  }

  // film grain over everything but the type
  {
    const ox = -Math.floor(Math.random() * 256), oy = -Math.floor(Math.random() * 256);
    ctx.globalAlpha = 1;
    for (let gy = oy; gy < VH; gy += 256) for (let gx = ox; gx < VW; gx += 256) ctx.drawImage(grainSpecks, gx, gy);
  }

  // the floor, set vertically in the corner
  verticalText(kanjiNum(G.depth) + '層', 26, 18, clamp(Math.min(VW, VH) * 0.034, 15, 24), ART.boneDim, 0.8);

  // title, first moments only: vertical, top right, as on the poster
  if (G.titleT < 5) {
    const a = G.titleT < 1 ? G.titleT : Math.max(0, 1 - (G.titleT - 2.5) / 2.5);
    const t = titleSprite();
    ctx.globalAlpha = a * 0.95;
    ctx.drawImage(t.c, VW - t.w - Math.max(18, VW * 0.04), Math.max(18, VH * 0.04), t.w, t.h);
    ctx.globalAlpha = 1;
  }

  // death screen
  if (G.state === 'dead' && G.stateT > 0.7) {
    const a = clamp((G.stateT - 0.7) / 0.6, 0, 1);
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = ART.ink;
    ctx.fillRect(0, 0, VW, VH);
    drawCracks(1, G.now);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = Math.round(Math.min(VW, VH) * 0.15);
    ctx.globalAlpha = a;
    ctx.fillStyle = ART.bone;
    ctx.font = `300 ${big}px ${SERIF}`;
    ctx.fillText(kanjiNum(G.depth), VW / 2, VH * 0.27);
    ctx.fillStyle = ART.boneDim;
    ctx.font = `500 ${Math.round(big * 0.2)}px ${SERIF}`;
    ctx.fillText('最深　' + kanjiNum(G.best), VW / 2, VH * 0.27 + big * 0.85);
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
