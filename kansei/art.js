// 慣性: procedural textures and sprites (no external assets). Everything here is drawn once
// into offscreen canvases; game.js maps them onto the diorama.
(function (root) {
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- noise
function H(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// value noise; with `per` the lattice wraps so the texture tiles
function vn(x, y, per, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = a => (per ? ((a % per) + per) % per : a);
  const a = H(w(xi), w(yi), s), b = H(w(xi + 1), w(yi), s), c = H(w(xi), w(yi + 1), s), d = H(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, per, s) {
  let amp = 0.5, f = 1, sum = 0, tot = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vn(x * f, y * f, per ? per * f : 0, s + i * 17);
    tot += amp; amp *= 0.5; f *= 2;
  }
  return sum / tot;
}
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// run `rows` units of work without freezing the page
function job(total, step, done, sync) {
  let i = 0;
  if (sync) { for (; i < total; i++) step(i); if (done) done(); return; }
  function run() {
    const t0 = performance.now();
    do { step(i++); } while (i < total && performance.now() - t0 < 10);
    if (i < total) setTimeout(run, 0); else if (done) done();
  }
  run();
}

// ---------------------------------------------------------------- rock: basalt columns, tiles both ways
function rock() {
  const S = 256, c = canvasOf(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), d = im.data;
  const COLS = 8, CW = S / COLS;
  for (let y = 0; y < S; y++) {
    const wob = (fbm(0.5, y / S * 6, 3, 6, 3) - 0.5) * 7;
    for (let x = 0; x < S; x++) {
      const xx = x + wob + S;
      const col = Math.floor(xx / CW) % COLS, u = (xx % CW) / CW;
      const tone = 0.78 + 0.34 * H(col, 1, 9);
      const edge = Math.min(u, 1 - u) * CW;
      const ao = sstep(0, 4.5, edge);
      // ledges across the column
      const per = 58 + H(col, 2, 4) * 50;
      const ly = (y + H(col, 3, 5) * per) % per;
      const ledge = ly < 2.4 ? 0.62 : ly < 4.2 ? 1.14 : 1;
      const n = fbm(x / S * 8, y / S * 8, 5, 8, 11), n2 = fbm(x / S * 32, y / S * 32, 3, 32, 21);
      let k = tone * (0.58 + 0.5 * ao) * (0.78 + 0.5 * n) * (0.9 + 0.2 * n2) * ledge * (1.06 - 0.22 * u);
      let r = 128 * k, gg = 122 * k, b = 116 * k;
      // iron stain and lichen
      const st = fbm(x / S * 5 + col, y / S * 3, 3, 0, 31);
      if (st > 0.6) { const t = (st - 0.6) * 2.2; r += 34 * t * k; gg += 14 * t * k; b -= 12 * t * k; }
      const li = fbm(x / S * 14, y / S * 14, 3, 14, 41);
      if (li > 0.66 && n > 0.5) { const t = clamp((li - 0.66) * 6, 0, 0.7); r = mix(r, 150, t); gg = mix(gg, 160, t); b = mix(b, 90, t); }
      const i = (y * S + x) * 4;
      d[i] = clamp(r, 0, 255); d[i + 1] = clamp(gg, 0, 255); d[i + 2] = clamp(b, 0, 255); d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}

// ---------------------------------------------------------------- moss and scrub
function moss() {
  const S = 256, c = canvasOf(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), d = im.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const a = fbm(x / S * 6, y / S * 6, 5, 6, 51), b = fbm(x / S * 24, y / S * 24, 3, 24, 61);
      const rockShow = sstep(0.6, 0.72, fbm(x / S * 4, y / S * 4, 4, 4, 71));
      let r = mix(52, 150, a * 1.15), g2 = mix(82, 168, a * 1.1), bl = mix(30, 70, a);
      const sp = H(x, y, 81);
      const t = 0.82 + 0.4 * b + (sp > 0.93 ? 0.35 : 0) - (sp < 0.05 ? 0.3 : 0);
      r *= t; g2 *= t; bl *= t;
      // sun-baked yellow tufts
      const y2 = fbm(x / S * 10 + 3, y / S * 10, 3, 10, 91);
      if (y2 > 0.62) { const k = (y2 - 0.62) * 3; r = mix(r, 178, k); g2 = mix(g2, 170, k); bl = mix(bl, 82, k); }
      r = mix(r, 126, rockShow * 0.85); g2 = mix(g2, 120, rockShow * 0.85); bl = mix(bl, 110, rockShow * 0.85);
      const i = (y * S + x) * 4;
      d[i] = clamp(r, 0, 255); d[i + 1] = clamp(g2, 0, 255); d[i + 2] = clamp(bl, 0, 255); d[i + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}

// ---------------------------------------------------------------- sky with clouds
// two panels wide; the horizon is the bottom edge
function sky(w, h, cb) {
  const c = canvasOf(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2f78d2'); gr.addColorStop(0.45, '#5aa2ea'); gr.addColorStop(0.8, '#a9d3f4'); gr.addColorStop(1, '#e4f1fb');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const rows = 48, rh = Math.ceil(h / rows);
  job(rows, r => {
    const y0 = r * rh, hh = Math.min(rh, h - y0);
    const im = g.getImageData(0, y0, w, hh), d = im.data;
    for (let yy = 0; yy < hh; yy++) {
      const y = y0 + yy, v = y / h;
      for (let x = 0; x < w; x++) {
        const px = x / w * 6, py = v * 3.2;
        const dens = fbm(px * 1.0, py * 2.3, 6, 0, 7) * 0.85 + fbm(px * 3.1 + 5, py * 5, 3, 0, 8) * 0.15;
        const thr = mix(0.7, 0.46, sstep(0.08, 0.82, v));
        let a = sstep(thr, thr + 0.2, dens);
        if (a <= 0.002) continue;
        const dl = fbm((px - 0.04) * 1.0, (py + 0.09) * 2.3, 6, 0, 7) * 0.85 + fbm((px - 0.04) * 3.1 + 5, (py + 0.09) * 5, 3, 0, 8) * 0.15;
        const shade = clamp(0.62 + (dens - dl) * 7 + (dens - thr) * 0.9, 0, 1);
        const cr = mix(138, 255, shade), cg = mix(160, 255, shade), cb = mix(200, 255, shade);
        const i = (yy * w + x) * 4;
        d[i] = mix(d[i], cr, a); d[i + 1] = mix(d[i + 1], cg, a); d[i + 2] = mix(d[i + 2], cb, a);
      }
    }
    g.putImageData(im, 0, y0);
  }, cb);
  return c;
}

// ---------------------------------------------------------------- the water
// land: [[cellX, cellY]]; fills `c` progressively, calls done(g) when finished
function sea(c, land, N, done) {
  const W = c.width, g = c.getContext('2d');
  const sc = W / N;
  const R = 8, S = N * R, df = new Float32Array(S * S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const cx = (px + 0.5) / R, cy = (py + 0.5) / R;
    let dd = 9;
    for (const [lx, ly] of land) {
      const dx = Math.max(lx - cx, 0, cx - lx - 1), dy = Math.max(ly - cy, 0, cy - ly - 1);
      const q = dx * dx + dy * dy;
      if (q < dd * dd) dd = Math.sqrt(q);
    }
    df[py * S + px] = dd;
  }
  const dist = (cx, cy) => {
    const fx = clamp(cx * R - 0.5, 0, S - 1.001), fy = clamp(cy * R - 0.5, 0, S - 1.001);
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    return mix(mix(df[y0 * S + x0], df[y0 * S + x0 + 1], tx), mix(df[(y0 + 1) * S + x0], df[(y0 + 1) * S + x0 + 1], tx), ty);
  };
  const Lx = -0.42, Ly = -0.5, Lz = 0.76;
  const hx = Lx, hy = Ly, hz = Lz + 1, hl = Math.hypot(hx, hy, hz);
  const HX = hx / hl, HY = hy / hl, HZ = hz / hl;
  const ramp = [[0, 232, 214, 164], [0.3, 214, 200, 154], [0.52, 120, 208, 206], [0.95, 52, 170, 210], [1.8, 36, 130, 192], [3.2, 22, 92, 160]];
  const rows = Math.max(1, Math.ceil(W / 16));
  job(rows, r => {
    const y0 = r * 16, hh = Math.min(16, W - y0);
    const im = g.createImageData(W, hh), o = im.data;
    for (let yy = 0; yy < hh; yy++) {
      const py = y0 + yy, cy = (py + 0.5) / sc;
      for (let px = 0; px < W; px++) {
        const cx = (px + 0.5) / sc;
        const dv = dist(cx, cy);
        const land = dv <= 0.0001;
        const nz = fbm(cx * 1.4 + 4, cy * 1.4, 3, 0, 5);
        const dn = Math.max(0, dv + (nz - 0.5) * 0.55);
        let i0 = 0;
        while (i0 < ramp.length - 2 && dn > ramp[i0 + 1][0]) i0++;
        const t = clamp((dn - ramp[i0][0]) / (ramp[i0 + 1][0] - ramp[i0][0]), 0, 1);
        let r = mix(ramp[i0][1], ramp[i0 + 1][1], t), gg = mix(ramp[i0][2], ramp[i0 + 1][2], t), b = mix(ramp[i0][3], ramp[i0 + 1][3], t);
        // swell and ripples give the surface a normal
        const e = 0.012;
        const h0 = fbm(cx * 2.4, cy * 2.4, 4, 0, 13), hxp = fbm((cx + e) * 2.4, cy * 2.4, 4, 0, 13), hyp = fbm(cx * 2.4, (cy + e) * 2.4, 4, 0, 13);
        const nx = -(hxp - h0) / e * 0.09, ny = -(hyp - h0) / e * 0.09, il = 1 / Math.hypot(nx, ny, 1);
        const ndl = (nx * Lx + ny * Ly + Lz) * il;
        const shallow = 1 - sstep(0.1, 1.5, dv);
        let k = 0.86 + 0.3 * ndl;
        r *= k; gg *= k; b *= k;
        // caustics dancing on the shallows
        if (shallow > 0 && !land) {
          const rr = 1 - Math.abs(2 * fbm(cx * 5.5, cy * 5.5, 3, 0, 23) - 1);
          const cs = Math.pow(rr, 6) * shallow * 0.75;
          r += 150 * cs; gg += 170 * cs; b += 150 * cs;
        }
        // sun glitter
        const ndh = (nx * HX + ny * HY + HZ) * il;
        const sp = Math.pow(Math.max(0, ndh), 90) * (0.35 + 0.65 * (1 - shallow)) * 0.6;
        r += 255 * sp; gg += 255 * sp; b += 240 * sp;
        // sand, wet at the water's edge
        const sandEdge = 0.2 + (nz - 0.5) * 0.35;
        if (dv < sandEdge + 0.08) {
          const sa = 1 - sstep(sandEdge - 0.04, sandEdge + 0.08, dv);
          const gr = 0.88 + 0.24 * H(px, py, 99);
          const wet = sstep(0.02, 0.16, dv);
          const sr = mix(226, 186, wet) * gr, sg = mix(208, 168, wet) * gr, sb = mix(158, 124, wet) * gr;
          r = mix(r, sr, sa); gg = mix(gg, sg, sa); b = mix(b, sb, sa);
        }
        // foam and the thin sheet of water running up the beach
        if (dv < 0.5 && !land) {
          const fn = fbm(cx * 11, cy * 11, 4, 0, 33);
          const band = Math.abs(dv - (0.2 + 0.05 * Math.sin(cx * 9 + cy * 7)));
          const fo = clamp(1 - band / 0.06, 0, 1) * sstep(0.35, 0.65, fn) * 0.9 + clamp(1 - dv / 0.12, 0, 1) * 0.35 * fn;
          r = mix(r, 248, fo); gg = mix(gg, 252, fo); b = mix(b, 252, fo);
        }
        const i = (yy * W + px) * 4;
        o[i] = clamp(r, 0, 255); o[i + 1] = clamp(gg, 0, 255); o[i + 2] = clamp(b, 0, 255); o[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, y0);
  }, () => done && done(g), true);
}

// ---------------------------------------------------------------- the cut-away base: water above, stacked stone below
function slab(w, h, seed) {
  const c = canvasOf(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  const cols = Math.round(w / 38);
  const tops = [];
  for (let i = 0; i <= cols; i++) tops.push(h * (0.46 + 0.38 * Math.pow(H(i, seed, 7), 1.4)));
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const ci = x / w * cols, i0 = Math.floor(ci);
      const top = mix(tops[i0], tops[i0 + 1], ci - i0 > 0.5 ? 1 : 0) + (fbm(x / w * 20, 3, 3, 0, seed + 5) - 0.5) * 10;
      let r, gg, b;
      if (y < top) {
        // water: bright at the surface, deepening, with light shafts and drifting specks
        const shaft = fbm(x / w * 14, y / h * 1.5, 3, 0, seed + 9);
        const k = 0.84 + 0.34 * shaft;
        r = mix(120, 14, Math.pow(v, 0.7)) * k; gg = mix(212, 74, Math.pow(v, 0.8)) * k; b = mix(232, 128, Math.pow(v, 0.9)) * k;
        if (H(x, y, seed + 13) > 0.9985) { r += 120; gg += 120; b += 120; }
      } else {
        // blocks of stone, mortar-dark, each its own tone
        const row = Math.floor((y - top) / 22), by = (y - top) % 22;
        const bw = 44 + H(row, seed, 3) * 30, bx = (x + H(row, 5, seed) * 80) % bw;
        const id = Math.floor((x + H(row, 5, seed) * 80) / bw);
        const tone = 0.62 + 0.5 * H(id, row, seed + 2);
        const edge = Math.min(bx, bw - bx, by, 22 - by);
        const ao = sstep(0, 3.2, edge);
        const n = fbm(x / 22, y / 22, 4, 0, seed + 21);
        const depth = 1 - 0.55 * Math.pow(v, 1.3);
        const kk = tone * (0.5 + 0.55 * ao) * (0.7 + 0.5 * n) * depth;
        r = 112 * kk; gg = 110 * kk; b = 112 * kk + 6;
        // water tint seeping into the stone near its top
        const wt = clamp(1 - (y - top) / 22, 0, 1) * 0.55;
        r = mix(r, 40, wt); gg = mix(gg, 110, wt); b = mix(b, 150, wt);
      }
      const j = (y * w + x) * 4;
      d[j] = clamp(r, 0, 255); d[j + 1] = clamp(gg, 0, 255); d[j + 2] = clamp(b, 0, 255); d[j + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}

// ---------------------------------------------------------------- sprites
function pine() {
  const w = 120, h = 200, c = canvasOf(w, h), g = c.getContext('2d');
  g.lineCap = 'round';
  g.fillStyle = '#4a3322';
  g.fillRect(w / 2 - 4, h - 44, 8, 40);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(w / 2 + 1, h - 44, 3, 40);
  const tiers = 7;
  for (let t = 0; t < tiers; t++) {
    const y = h - 40 - t * 22, wd = 48 - t * 5.2, n = 46 - t * 4;
    for (let k = 0; k < n; k++) {
      const side = (H(k, t, 3) * 2 - 1), x0 = w / 2 + side * wd * 0.2;
      const x1 = w / 2 + side * wd, y1 = y + 10 + H(k, t, 4) * 8 - Math.abs(side) * 4;
      const lit = clamp(0.5 - side * 0.5 + (H(k, t, 5) - 0.5) * 0.5, 0, 1);
      g.strokeStyle = `rgb(${Math.round(24 + 40 * lit)},${Math.round(64 + 70 * lit)},${Math.round(34 + 24 * lit)})`;
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y1); g.stroke();
    }
  }
  return c;
}
function softPuff(kind) {
  const S = 128, c = canvasOf(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), d = im.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1, r = Math.hypot(dx, dy);
    const n = fbm(x / S * 4 + (kind === 'fire' ? 9 : 0), y / S * 4, 4, 0, kind === 'fire' ? 2 : 1);
    const edge = clamp(1 - r * (0.85 + 0.55 * (n - 0.3)), 0, 1);
    const a = Math.pow(edge, kind === 'trail' ? 1.6 : 1.25);
    let R, G, B;
    if (kind === 'smoke') { const s = 70 + 90 * n; R = s; G = s + 3; B = s + 9; }
    else if (kind === 'trail') { const s = 236 + 19 * n; R = s; G = s; B = 255; }
    else {
      const t = clamp(1 - r * 1.1 + (n - 0.5) * 0.5, 0, 1);
      R = mix(190, 255, Math.min(1, t * 2)); G = mix(30, 236, t * t * t); B = mix(0, 170, t * t * t * t);
    }
    const i = (y * S + x) * 4;
    d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = clamp(a * 255, 0, 255);
  }
  g.putImageData(im, 0, 0);
  return c;
}

root.KanseiArt = { fbm, vn, H, rock, moss, sky, sea, slab, pine, softPuff, job, mix, clamp, sstep };
})(window);
