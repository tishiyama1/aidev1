// めぐり: rules only (no DOM). Loaded by the page and by automated checks.
(function (root) {
'use strict';

const R = 4;
const CELLS = [];
const INDEX = new Map();
for (let q = -R; q <= R; q++) {
  for (let r = -R; r <= R; r++) {
    if (Math.abs(q + r) > R) continue;
    INDEX.set(q + ',' + r, CELLS.length);
    CELLS.push({ q, r });
  }
}
const N = CELLS.length;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const NBR = CELLS.map(({ q, r }) => DIRS.map(([dq, dr]) => INDEX.get((q + dq) + ',' + (r + dr))).filter(i => i !== undefined));

// 1 fire, 2 water, 3 plant. VICTIM[k] is what k overcomes.
const FIRE = 1, WATER = 2, PLANT = 3, ROCK = 4;
const VICTIM = [0, PLANT, FIRE, WATER, 0];
// rule numbers, settled by checking the design hypothesis with automated play
const CFG = { clear: 5, rate0: 0.3, rateUp: 0.01, start: 6, chainPow: 2 };

function group(b, i) {
  const k = b[i];
  const out = [i];
  const seen = new Set(out);
  for (let h = 0; h < out.length; h++) {
    for (const n of NBR[out[h]]) {
      if (!seen.has(n) && b[n] === k) { seen.add(n); out.push(n); }
    }
  }
  return out;
}

function bigGroups(b) {
  const seen = new Uint8Array(N);
  const out = [];
  for (let i = 0; i < N; i++) {
    if (!b[i] || b[i] === ROCK || seen[i]) continue;
    const g = group(b, i);
    for (const j of g) seen[j] = 1;
    if (g.length >= CFG.clear) out.push(g);
  }
  return out;
}

// Place `kind` at `cell` and play out everything that follows: groups that
// reach CFG.clear burst, and each burst stone turns the neighbouring groups it
// overcomes into its own kind, which may make new groups burst (a chain).
// Returns the new board and the stages, for animation and preview.
function resolve(board, cell, kind) {
  const b = board.slice();
  b[cell] = kind;
  const stages = [{ type: 'place', cell, kind }];
  let sources = [];
  let chain = 0, score = 0, cleared = 0;
  for (let guard = 0; guard < 64; guard++) {
    // the sources overcome whole neighbouring groups of their victim kind
    const conv = [];
    const touched = new Set();
    for (const s of sources) {
      const v = VICTIM[s.k];
      for (const n of NBR[s.i]) {
        if (b[n] !== v || touched.has(n)) continue;
        for (const g of group(b, n)) {
          if (touched.has(g)) continue;
          touched.add(g);
          b[g] = s.k;
          conv.push({ i: g, from: v, to: s.k, src: s.i });
        }
      }
    }
    if (conv.length) stages.push({ type: 'convert', cells: conv });
    // big enough groups burst
    const groups = bigGroups(b);
    if (!groups.length) break;
    chain++;
    const gone = [];
    let size = 0;
    for (const g of groups) {
      for (const i of g) gone.push({ i, k: b[i] });
      size += g.length;
    }
    const mult = Math.pow(chain, CFG.chainPow);
    const pts = size * 10 * mult;
    score += pts;
    cleared += size;
    for (const { i } of gone) b[i] = 0;
    // rocks next to a burst crumble with it
    const rubble = [];
    for (const { i } of gone) for (const n of NBR[i]) if (b[n] === ROCK) { b[n] = 0; rubble.push(n); }
    const rp = rubble.length * 5 * mult;
    score += rp;
    stages.push({ type: 'clear', cells: gone, chain, pts: pts + rp, rubble, groups: groups.map(g => g.slice()) });
    sources = gone;
  }
  return { board: b, stages, score, chain, cleared };
}

function empties(b) {
  const out = [];
  for (let i = 0; i < N; i++) if (!b[i]) out.push(i);
  return out;
}

// A whole game's state, stepped one placement at a time.
function newGame(rnd) {
  const g = {
    board: new Int8Array(N), queue: [], score: 0, turn: 0, best: 0, over: false,
    maxChain: 0, chains2: 0, drops: [], dropAcc: 0, rnd,
  };
  for (let i = 0; i < 3; i++) g.queue.push(1 + Math.floor(rnd() * 3));
  // a few stones to start from
  // a few loose stones to begin with
  for (let i = 0; i < CFG.start; i++) {
    const e = empties(g.board);
    for (let tries = 0; tries < 20; tries++) {
      const c = e[Math.floor(rnd() * e.length)], k = 1 + Math.floor(rnd() * 3);
      if (NBR[c].every(n => g.board[n] !== k)) { g.board[c] = k; break; }
    }
  }
  planDrops(g);
  return g;
}

// stones that fall in on their own: slowly at first, then faster
function dropRate(turn) {
  return CFG.rate0 + turn * CFG.rateUp;
}

// pick where and what will fall next, without making a group that would burst
function chooseDrop(g, avoid) {
  const e = empties(g.board).filter(i => !(avoid && avoid.has(i)));
  if (!e.length) return null;
  for (let tries = 0; tries < 40; tries++) {
    const i = e[Math.floor(g.rnd() * e.length)];
    const k = ROCK;
    const b = g.board.slice();
    b[i] = k;
    if (k === ROCK || group(b, i).length < CFG.clear) return { i, k };
  }
  return null;
}

// decide (and show) what falls after the next move
function planDrops(g) {
  g.dropAcc += dropRate(g.turn);
  const n = Math.floor(g.dropAcc);
  g.dropAcc -= n;
  g.drops = [];
  const taken = new Set();
  for (let k = 0; k < n; k++) {
    const d = chooseDrop(g, taken);
    if (!d) break;
    taken.add(d.i);
    g.drops.push(d);
  }
}

// One move. Returns the resolution (with stages) plus what dropped afterwards.
// `pick` chooses which of the three stones in hand to place
function play(g, cell, pick) {
  if (g.over || g.board[cell]) return null;
  const kind = g.queue.splice(pick || 0, 1)[0];
  g.queue.push(1 + Math.floor(g.rnd() * 3));
  const res = resolve(g.board, cell, kind);
  g.board = res.board;
  g.score += res.score;
  g.turn++;
  if (res.chain > g.maxChain) g.maxChain = res.chain;
  if (res.chain >= 2) g.chains2++;
  const dropped = [];
  for (let d of g.drops) {
    // a marked spot that got taken, or would now burst, falls somewhere else
    if (g.board[d.i]) d = chooseDrop(g);
    else {
      const b = g.board.slice();
      b[d.i] = d.k;
      if (d.k !== ROCK && group(b, d.i).length >= CFG.clear) d = chooseDrop(g);
    }
    if (d) { g.board[d.i] = d.k; dropped.push(d); }
  }
  planDrops(g);
  if (!empties(g.board).length) g.over = true;
  return { res, kind, dropped };
}

const api = { CFG, R, N, CELLS, NBR, INDEX, VICTIM, FIRE, WATER, PLANT, ROCK, group, bigGroups, resolve, empties, newGame, play, dropRate };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.MeguriLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
