// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// ForceAtlas2 (Jacomy, Venturini, Heymann, Bastian — PLoS ONE 2014) em Web Worker.
// Barnes-Hut sobre quadtree em POOL de Float64Array (zero alocação por iteração → sem pressão de GC).
// Posições devolvidas por transferência de ArrayBuffer (sem cópia) a cada lote de iterações.

let N = 0, E = 0;
let X, Y, DX, DY, ODX, ODY, M, S, FIX, ES, ET, EW;
// padrões MEDIDOS (fa2_tune): escala 10 + gravidade forte → razão folha/envergadura 0,123 (vs 0,078) e −22 % ms/iteração
let cfg = { scaling: 10, gravity: 1, strong: true, linlog: false, overlap: false, theta: 1.2, jitter: 1, edgeWeight: 1 };
let speed = 1, speedEff = 1, rodando = false, iter = 0;

// ── quadtree em pool ─────────────────────────────────────────────────────
let QCAP = 0, qN = 0;
let QX0, QY0, QW, QMASS, QCX, QCY, QCHILD, QBODY;          // QCHILD: 4 filhos (−1 = vazio); QBODY: corpo único ou −1
function qGarantir(n) {
  if (n <= QCAP) return;
  QCAP = Math.max(n, QCAP * 2 || 1024);
  QX0 = new Float64Array(QCAP); QY0 = new Float64Array(QCAP); QW = new Float64Array(QCAP);
  QMASS = new Float64Array(QCAP); QCX = new Float64Array(QCAP); QCY = new Float64Array(QCAP);
  QCHILD = new Int32Array(QCAP * 4); QBODY = new Int32Array(QCAP);
}
function qNovo(x0, y0, w) {
  if (qN >= QCAP) { const velho = [QX0, QY0, QW, QMASS, QCX, QCY, QCHILD, QBODY]; const cap = QCAP; QCAP = 0; qGarantir(cap * 2);
    QX0.set(velho[0]); QY0.set(velho[1]); QW.set(velho[2]); QMASS.set(velho[3]); QCX.set(velho[4]); QCY.set(velho[5]); QCHILD.set(velho[6]); QBODY.set(velho[7]); }
  const k = qN++;
  QX0[k] = x0; QY0[k] = y0; QW[k] = w; QMASS[k] = 0; QCX[k] = 0; QCY[k] = 0; QBODY[k] = -1;
  QCHILD[k * 4] = QCHILD[k * 4 + 1] = QCHILD[k * 4 + 2] = QCHILD[k * 4 + 3] = -1;
  return k;
}
function qInserir(k, i, prof) {
  while (true) {
    const m = M[i];
    const folha = QCHILD[k * 4] < 0 && QCHILD[k * 4 + 1] < 0 && QCHILD[k * 4 + 2] < 0 && QCHILD[k * 4 + 3] < 0;
    if (QMASS[k] === 0 && folha) { QBODY[k] = i; QMASS[k] = m; QCX[k] = X[i]; QCY[k] = Y[i]; return; }
    if (folha && QBODY[k] >= 0) {                                    // divide: reinsere o corpo antigo
      const j = QBODY[k]; QBODY[k] = -1;
      if (prof > 40) { QMASS[k] += m; return; }                      // pontos coincidentes: agrega
      const c = qFilho(k, X[j], Y[j]); qAcumular(c, j); QBODY[c] = j;
    }
    QCX[k] = (QCX[k] * QMASS[k] + X[i] * m) / (QMASS[k] + m);
    QCY[k] = (QCY[k] * QMASS[k] + Y[i] * m) / (QMASS[k] + m);
    QMASS[k] += m;
    k = qFilho(k, X[i], Y[i]); prof++;
  }
}
function qAcumular(c, j) { QMASS[c] = M[j]; QCX[c] = X[j]; QCY[c] = Y[j]; }
function qFilho(k, x, y) {
  const h = QW[k] / 2, cx = QX0[k] + h, cy = QY0[k] + h;
  const q = (x >= cx ? 1 : 0) + (y >= cy ? 2 : 0);
  let c = QCHILD[k * 4 + q];
  if (c < 0) { c = qNovo(q & 1 ? cx : QX0[k], q & 2 ? cy : QY0[k], h); QCHILD[k * 4 + q] = c; }
  return c;
}
function qRepulsao(i, kr) {
  const pilha = qPilha; let topo = 0; pilha[topo++] = 0;
  const xi = X[i], yi = Y[i], mi = M[i], th2 = cfg.theta * cfg.theta;
  while (topo) {
    const k = pilha[--topo];
    if (QMASS[k] === 0 || QBODY[k] === i) continue;
    const dx = xi - QCX[k], dy = yi - QCY[k]; let d2 = dx * dx + dy * dy;
    const folha = QBODY[k] >= 0;
    if (folha || QW[k] * QW[k] < th2 * d2) {
      if (d2 < 1e-9) continue;
      let d = Math.sqrt(d2), f;
      if (cfg.overlap && folha) { d -= S[i] + S[QBODY[k]]; if (d <= 0) { f = 100 * kr * mi * QMASS[k]; DX[i] += dx * f; DY[i] += dy * f; continue; } }
      f = kr * mi * QMASS[k] / (d * d);
      DX[i] += dx * f; DY[i] += dy * f;
    } else {
      for (let q = 0; q < 4; q++) { const c = QCHILD[k * 4 + q]; if (c >= 0) { if (topo >= pilha.length) qPilha = growStack(); pilha[topo++] = c; } }
    }
  }
}
let qPilha = new Int32Array(4096);
function growStack() { const n = new Int32Array(qPilha.length * 2); n.set(qPilha); qPilha = n; return n; }

// ── uma iteração de ForceAtlas2 ──────────────────────────────────────────
function passo() {
  for (let i = 0; i < N; i++) { ODX[i] = DX[i]; ODY[i] = DY[i]; DX[i] = 0; DY[i] = 0; }
  // quadtree
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) { if (X[i] < x0) x0 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (X[i] > x1) x1 = X[i]; if (Y[i] > y1) y1 = Y[i]; }
  qN = 0; qGarantir(N * 2 + 16);
  const raiz = qNovo(x0 - 1, y0 - 1, Math.max(x1 - x0, y1 - y0) + 2);
  for (let i = 0; i < N; i++) qInserir(raiz, i, 0);
  const kr = cfg.scaling;
  for (let i = 0; i < N; i++) qRepulsao(i, kr);
  // gravidade
  for (let i = 0; i < N; i++) {
    const d = Math.sqrt(X[i] * X[i] + Y[i] * Y[i]) || 1e-9;
    const f = cfg.strong ? cfg.gravity * M[i] : cfg.gravity * M[i] / d;
    DX[i] -= X[i] * f; DY[i] -= Y[i] * f;
  }
  // atração pelas arestas
  for (let e = 0; e < E; e++) {
    const a = ES[e], b = ET[e]; const dx = X[a] - X[b], dy = Y[a] - Y[b];
    let d = Math.sqrt(dx * dx + dy * dy); if (d < 1e-9) continue;
    if (cfg.overlap) { d -= S[a] + S[b]; if (d <= 0) continue; }
    const w = Math.pow(EW[e], cfg.edgeWeight);
    const f = cfg.linlog ? -w * Math.log(1 + d) / d : -w;
    DX[a] += dx * f; DY[a] += dy * f; DX[b] -= dx * f; DY[b] -= dy * f;
  }
  // velocidade adaptativa (swinging / traction)
  let swing = 0, trac = 0;
  for (let i = 0; i < N; i++) {
    const sx = ODX[i] - DX[i], sy = ODY[i] - DY[i], tx = ODX[i] + DX[i], ty = ODY[i] + DY[i];
    swing += M[i] * Math.sqrt(sx * sx + sy * sy); trac += 0.5 * M[i] * Math.sqrt(tx * tx + ty * ty);
  }
  const est = 0.05 * Math.sqrt(N), minJ = Math.sqrt(est), maxJ = 10;
  let jt = cfg.jitter * Math.max(minJ, Math.min(maxJ, est * trac / (N * N)));
  if (swing / trac > 2) { if (speedEff > 0.5) speedEff *= 0.5; jt = Math.max(jt, cfg.jitter); }
  const alvo = swing ? jt * speedEff * trac / swing : speed;
  if (swing > jt * trac) { if (speedEff > 0.7) speedEff *= 0.7; } else if (speed < 1000) speedEff *= 1.3;
  speed = speed + Math.min(alvo - speed, 0.5 * speed);
  for (let i = 0; i < N; i++) {
    if (FIX[i]) continue;
    const sx = ODX[i] - DX[i], sy = ODY[i] - DY[i];
    const sw = M[i] * Math.sqrt(sx * sx + sy * sy);
    let f = speed / (1 + Math.sqrt(speed * sw));
    if (cfg.overlap) { const df = Math.sqrt(DX[i] * DX[i] + DY[i] * DY[i]); f = Math.min(f * df, 10) / (df || 1); f *= 0.1; }
    X[i] += DX[i] * f; Y[i] += DY[i] * f;
  }
  iter++;
}

function enviar() {
  const buf = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { buf[2 * i] = X[i]; buf[2 * i + 1] = Y[i]; }
  postMessage({ tipo: "pos", buf, iter }, [buf.buffer]);           // transferência: sem cópia
}

function ciclo() {
  if (!rodando) return;
  const t0 = performance.now();
  while (performance.now() - t0 < 14) passo();                     // ~1 quadro por lote
  enviar();
  setTimeout(ciclo, 0);
}

onmessage = (e) => {
  const m = e.data;
  if (m.tipo === "grafo") {
    N = m.n; E = m.es.length;
    X = new Float64Array(m.x); Y = new Float64Array(m.y);
    DX = new Float64Array(N); DY = new Float64Array(N); ODX = new Float64Array(N); ODY = new Float64Array(N);
    M = new Float64Array(m.massa); S = new Float64Array(m.tam); FIX = new Uint8Array(N);
    ES = new Int32Array(m.es); ET = new Int32Array(m.et); EW = new Float32Array(m.ew);
    speed = 1; speedEff = 1; iter = 0;
    enviar();
  } else if (m.tipo === "cfg") { Object.assign(cfg, m.cfg); }
  else if (m.tipo === "rodar") { if (!rodando) { rodando = true; ciclo(); } }
  else if (m.tipo === "parar") { rodando = false; }
  else if (m.tipo === "fixar") { FIX[m.i] = m.fix ? 1 : 0; if (m.x !== undefined) { X[m.i] = m.x; Y[m.i] = m.y; } if (!rodando) enviar(); }
};
