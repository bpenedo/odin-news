// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Motor de ALGORITMO GENÉTICO do gosto de leitura — 100 % local (nada sai do navegador).
//
// Sinais (gravados por Flip/Portal): curtir ♥ 1.0 · salvar na Estante .8 · compartilhar .7 ·
// comentar .6 · abrir .3 · VISTO sem interação = exemplo negativo (0).
// Genoma = pesos em [-1, 1] para cada coluna, fonte e termo do vocabulário + recência + imagem.
// nota(notícia) = Σ peso[coluna] + Σ peso[fonte] + média(peso[termos]) + w_rec·recência + w_img·imagem
// Aptidão = AUC ponderada (probabilidade de uma notícia que você aprovou ficar ACIMA de uma que você
// só viu) − λ·‖w‖² (regularização: evita decorar). Seleção por torneio, cruzamento uniforme,
// mutação gaussiana, elitismo, semente com o melhor genoma da rodada anterior (aprendizado contínuo).
// Float32Array em tudo; roda num Web Worker (genetico-worker.js) — a interface não trava.

export const PESOS_SINAL = { like: 1, salvo: 0.8, compartilhado: 0.7, comentado: 0.6, aberto: 0.3 };
export const MIN_POSITIVOS = 3;
const PARES_MAX = 8000;                  // AUC amostrada quando há muitos pares (custo O(pares))

const PARADAS = new Set("about after antes como com para pela pelo pelos pelas sobre também their there these this from with what when where which while will mais menos entre ainda após sendo desde essa esse isso está estão foram onde quando porque nova novo novas novos".split(" "));
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Atributos compactos de uma notícia (guardados junto do sinal: o aprendizado sobrevive à virada do dia). */
export function atributos(i) {
  let t = (i.tags || []).map(norm).filter(Boolean);
  if (!t.length) t = norm(i.titulo).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5 && !PARADAS.has(w));
  return { c: i.coluna || "", f: norm(i.fonte), t: [...new Set(t)].slice(0, 8), img: i.imagem ? 1 : 0, d: i.data || i.publicado || "" };
}

/** Rótulo de um registro de sinais: o maior peso entre as ações; 0 = só visto. */
export function rotulo(s) {
  let y = 0;
  for (const [k, w] of Object.entries(PESOS_SINAL)) if (s[k]) y = Math.max(y, w);
  return y;
}

/** Vocabulário: todas as colunas + fontes e termos mais frequentes nos exemplos. */
export function vocabulario(exemplos, colunas, maxFontes = 60, maxTermos = 160) {
  const conta = (sel) => { const m = new Map(); for (const e of exemplos) for (const x of sel(e)) m.set(x, (m.get(x) || 0) + 1); return m; };
  const top = (m, n) => [...m].filter(([k, v]) => k && v >= 1).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  const nomes = [...colunas.map((c) => "c:" + c), ...top(conta((e) => [e.a.f]), maxFontes).map((f) => "f:" + f),
                 ...top(conta((e) => e.a.t), maxTermos).map((t) => "t:" + t)];
  return { nomes, idx: new Map(nomes.map((n, k) => [n, k])), G: nomes.length + 2 };   // +2: recência, imagem
}

/** Codifica atributos em índices do vocabulário (esparsos) — feito UMA vez, antes das gerações. */
export function codificar(a, voc, agora = Date.now()) {
  const c = voc.idx.get("c:" + a.c) ?? -1, f = voc.idx.get("f:" + a.f) ?? -1;
  const t = Int32Array.from(a.t.map((x) => voc.idx.get("t:" + x)).filter((k) => k !== undefined));
  const h = a.d ? (agora - Date.parse(a.d)) / 3.6e6 : 72;
  return { c, f, t, rec: Number.isFinite(h) ? Math.exp(-Math.max(0, h) / 48) : 0, img: a.img };
}

export function nota(g, x, G) {
  let s = (x.c >= 0 ? g[x.c] : 0) + (x.f >= 0 ? g[x.f] : 0);
  if (x.t.length) { let m = 0; for (let k = 0; k < x.t.length; k++) m += g[x.t[k]]; s += m / x.t.length; }
  return s + g[G - 2] * x.rec + g[G - 1] * x.img;
}

function aptidao(g, X, Y, pos, neg, pares, G, lambda) {
  const sc = new Float32Array(X.length);
  for (let k = 0; k < X.length; k++) sc[k] = nota(g, X[k], G);
  let ac = 0, tot = 0;
  for (let k = 0; k < pares.length; k += 2) {
    const p = pares[k], n = pares[k + 1], w = Y[p] - Y[n];
    ac += w * (sc[p] > sc[n] ? 1 : sc[p] === sc[n] ? 0.5 : 0); tot += w;
  }
  let l2 = 0; for (let k = 0; k < G; k++) l2 += g[k] * g[k];
  return (tot ? ac / tot : 0.5) - lambda * l2 / G;
}

function rng(semente) {               // mulberry32: reprodutível (testes) e rápido
  let a = semente >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Evolui a população. `exemplos` = [{a: atributos, y: rótulo}], `semente` = genoma anterior {nomes, pesos}.
 * Devolve {nomes, pesos, aptidao, historico, geracoes, ms, positivos, negativos}.
 */
export function evoluir(exemplos, colunas, { pop = 60, geracoes = 40, torneio = 3, pMut = 0.08, sigma = 0.15, elite = 2,
  lambda = 0.02, semente = null, aleatorio = 12345, agora = Date.now() } = {}) {
  const t0 = performance.now();
  const r = rng(aleatorio);
  const voc = vocabulario(exemplos, colunas), G = voc.G;
  const X = exemplos.map((e) => codificar(e.a, voc, agora)), Y = Float32Array.from(exemplos.map((e) => e.y));
  const pos = [], neg = [];
  Y.forEach((y, k) => (y > 0 ? pos : neg).push(k));
  if (pos.length < MIN_POSITIVOS) return null;
  // pares (melhor, pior): todo positivo contra todo item de rótulo menor; amostrado se passar de PARES_MAX
  let todos = [];
  for (const p of pos) for (let n = 0; n < Y.length; n++) if (Y[n] < Y[p]) todos.push(p, n);
  if (todos.length / 2 > PARES_MAX) {
    const s = new Int32Array(PARES_MAX * 2);
    for (let k = 0; k < PARES_MAX; k++) { const j = Math.floor(r() * todos.length / 2) * 2; s[2 * k] = todos[j]; s[2 * k + 1] = todos[j + 1]; }
    todos = s;
  }
  const pares = Int32Array.from(todos);
  const gaus = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clip = (x) => (x > 1 ? 1 : x < -1 ? -1 : x);
  let P = Array.from({ length: pop }, () => Float32Array.from({ length: G }, () => (r() * 2 - 1) * 0.3));
  if (semente?.nomes) {                                         // aprendizado contínuo: herda o genoma anterior
    const ant = new Map(semente.nomes.map((n, k) => [n, semente.pesos[k]]));
    const g0 = new Float32Array(G);
    voc.nomes.forEach((n, k) => (g0[k] = ant.get(n) ?? 0));
    g0[G - 2] = semente.pesos[semente.nomes.length] ?? 0; g0[G - 1] = semente.pesos[semente.nomes.length + 1] ?? 0;
    P[0] = g0;
    for (let k = 1; k < Math.min(pop, 6); k++) P[k] = g0.map((x) => clip(x + gaus() * sigma));
  }
  let F = P.map((g) => aptidao(g, X, Y, pos, neg, pares, G, lambda));
  const historico = [];
  for (let ger = 0; ger < geracoes; ger++) {
    const ordem = F.map((f, k) => k).sort((a, b) => F[b] - F[a]);
    historico.push(F[ordem[0]]);
    const nova = ordem.slice(0, elite).map((k) => P[k]);
    const escolher = () => { let b = Math.floor(r() * pop); for (let k = 1; k < torneio; k++) { const c = Math.floor(r() * pop); if (F[c] > F[b]) b = c; } return P[b]; };
    while (nova.length < pop) {
      const a = escolher(), b = escolher(), f = new Float32Array(G);
      for (let k = 0; k < G; k++) { f[k] = r() < 0.5 ? a[k] : b[k]; if (r() < pMut) f[k] = clip(f[k] + gaus() * sigma); }
      nova.push(f);
    }
    P = nova; F = P.map((g) => aptidao(g, X, Y, pos, neg, pares, G, lambda));
  }
  const best = F.indexOf(Math.max(...F));
  historico.push(F[best]);
  return { nomes: voc.nomes, pesos: Array.from(P[best], (x) => Math.round(x * 1e4) / 1e4), aptidao: F[best], historico,
           geracoes, ms: Math.round(performance.now() - t0), positivos: pos.length, negativos: neg.length };
}

/** Pontua notícias do dia com o genoma. Com `explorar`, 1 a cada N posições vai para algo fora da bolha. */
export function ranquear(itens, genoma, { explorar = 6, agora = Date.now(), aleatorio = 7 } = {}) {
  const voc = { idx: new Map(genoma.nomes.map((n, k) => [n, k])), G: genoma.nomes.length + 2 };
  const g = Float32Array.from(genoma.pesos);
  const ord = itens.map((i) => ({ i, s: nota(g, codificar(atributos(i), voc, agora), voc.G) })).sort((a, b) => b.s - a.s);
  if (!explorar) return ord.map((x) => x.i);
  const r = rng(aleatorio), topo = ord.slice(0, Math.ceil(ord.length / 2)), resto = ord.slice(topo.length);
  const out = [];
  while (topo.length || resto.length) {
    const k = out.length;
    if ((k + 1) % explorar === 0 && resto.length) out.push(resto.splice(Math.floor(r() * resto.length), 1)[0].i);
    else out.push((topo.length ? topo : resto).shift().i);
  }
  return out;
}

/** Os gostos aprendidos, legíveis: maiores pesos positivos por tipo. */
export function interesses(genoma, n = 10) {
  return genoma.nomes.map((nome, k) => ({ tipo: nome[0], valor: nome.slice(2), peso: genoma.pesos[k] }))
    .filter((x) => x.peso > 0.15).sort((a, b) => b.peso - a.peso).slice(0, n);
}
