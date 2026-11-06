// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Núcleo compartilhado dos aplicativos do painel (Jornal, Portal, Estante, Flip, Grafo, FdRSS).
// Estado do usuário 100% LOCAL: localStorage (preferências, estante, seleção) + IndexedDB (imagens).
// Nada sai da máquina.

const PREFIXO = "odin:";
// Caminho-base do site: "" em 127.0.0.1:8700, "/<repo>" no GitHub Pages — deduzido do próprio módulo,
// então o MESMO código serve local e público sem configuração.
export const BASE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
export const VERSAO = new URL(import.meta.url).search;            // "?v=<hash>" recebido do OdinApp
export const rota = (p) => (p.startsWith("/") && !p.startsWith(BASE + "/") ? BASE + p : p);
export const LOCAL = ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
const URL_PAINEL = BASE + "/odin/dados/painel.json";
let _painel = null;

// ── dados ───────────────────────────────────────────────────────────────
export function carregarPainel(forcar = false) {
  if (!_painel || forcar) {
    _painel = fetch(URL_PAINEL, { cache: forcar ? "no-store" : "default" }).then((r) => {
      if (!r.ok) throw new Error(`painel.json indisponível (HTTP ${r.status})`);
      return r.json();
    }).then(normalizarPainel);
  }
  return _painel;
}

function normalizarPainel(p) {
  // chaves curtas no disco (~4× menor); nomes legíveis em memória
  const cats = p.c.map((c) => ({ id: c.id, nome: c.n, emoji: c.e }));
  const nomeCat = Object.fromEntries(cats.map((c) => [c.id, c]));
  const itens = p.i.map((i) => ({
    id: i.i, coluna: i.c, titulo: i.t, link: i.l, fonte: i.f, feed: (p.F || [])[i.fd] ?? i.fd, data: i.dt, resumo: i.r,
    tags: i.g || [], imagem: i.img || "", online: i.on,
  }));
  const manchetes = {};
  for (const [cid, lst] of Object.entries(p.h)) {
    manchetes[cid] = lst.map((m) => ({ id: m.i, titulo: m.t, link: m.l, fonte: m.f, nFontes: m.nf, resumo: m.r,
      tags: m.g || [], pos: m.p || [], imagem: m.img || "", data: m.dt, coluna: cid }));
  }
  return { dia: p.d, gerado: p.g, categorias: cats, nomeCat, itens, manchetes, manchete: p.m };
}

// ── estado local ────────────────────────────────────────────────────────
export function ler(chave, padrao) {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return v === null ? padrao : JSON.parse(v);
  } catch { return padrao; }
}

export function gravar(chave, valor) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
    window.dispatchEvent(new CustomEvent("odin:estado", { detail: { chave } }));
    return true;
  } catch (e) {
    toast("⚠️ Armazenamento local cheio — exporte e limpe a Estante.");
    return false;
  }
}

// IndexedDB mínimo para imagens (localStorage tem ~5 MB e é síncrono)
const IDB = "odin-imagens";
function idb() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("img");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
export async function imgGravar(chave, blob) {
  const db = await idb();
  return new Promise((ok, erro) => {
    const tx = db.transaction("img", "readwrite");
    blob ? tx.objectStore("img").put(blob, chave) : tx.objectStore("img").delete(chave);
    tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error);
  });
}
export async function imgLer(chave) {
  const db = await idb();
  return new Promise((ok) => {
    const r = db.transaction("img").objectStore("img").get(chave);
    r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null);
  });
}
const _urls = new Map();                     // revoga object URLs antigos: sem vazamento de memória
export async function imgUrl(chave) {
  const b = await imgLer(chave);
  if (_urls.has(chave)) URL.revokeObjectURL(_urls.get(chave));
  if (!b) { _urls.delete(chave); return null; }
  const u = URL.createObjectURL(b);
  _urls.set(chave, u);
  return u;
}

/** Reduz a imagem enviada para no máx. 1600 px (JPEG 0,82): um fundo de 8 MB vira ~250 KB. */
export function reduzirImagem(arquivo, max = 1600) {
  return new Promise((ok, erro) => {
    const img = new Image();
    const u = URL.createObjectURL(arquivo);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(u);
      cv.toBlob((b) => (b ? ok(b) : erro(new Error("falha ao reduzir"))), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); erro(new Error("imagem inválida")); };
    img.src = u;
  });
}

// ── utilidades ──────────────────────────────────────────────────────────
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const truncar = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n).trimEnd() + "..." : s; };
export function debounce(fn, ms = 120) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const _fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
export function fmtData(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : _fmt.format(d); }
export function dataLonga(dia) {
  const d = new Date(dia + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function dominio(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }
export function minutosLeitura(txt) { return Math.max(1, Math.round(String(txt || "").split(/\s+/).length / 200)); }

let _toastEl;
export function toast(msg) {
  if (!_toastEl) { _toastEl = Object.assign(document.createElement("div"), { className: "odin-toast", role: "status" }); document.body.appendChild(_toastEl); }
  _toastEl.textContent = msg; _toastEl.classList.add("vis");
  clearTimeout(_toastEl._t); _toastEl._t = setTimeout(() => _toastEl.classList.remove("vis"), 2200);
}

export function carregarCss(href) {
  href = rota(href) + (href.endsWith(".css") ? VERSAO : "");   // CSS na mesma versão dos módulos
  if (document.querySelector(`link[data-odin="${href}"]`)) return;
  const l = Object.assign(document.createElement("link"), { rel: "stylesheet", href });
  l.dataset.odin = href; document.head.appendChild(l);
}

// ── POS: palavras etiquetadas ───────────────────────────────────────────
const POS_COR = { PROPN: "#1d4ed8", NOUN: "#15803d", VERB: "#c2410c", ADJ: "#7e22ce", NUM: "#0f766e" };
const POS_NOME = { PROPN: "nome próprio", NOUN: "substantivo", VERB: "verbo", ADJ: "adjetivo", NUM: "número", ADV: "advérbio" };
export function posHTML(pos) {
  return (pos || []).map(([t, p]) => POS_COR[p]
    ? `<span class="odin-pos" title="${POS_NOME[p] || p}" style="border-bottom:2px solid ${POS_COR[p]}">${esc(t)}</span>`
    : esc(t)).join(" ").replace(/ ([,.:;!?%)])/g, "$1");
}
export const POS_LEGENDA = Object.entries(POS_COR).map(([p, c]) => `<span style="border-bottom:2px solid ${c}">${POS_NOME[p]}</span>`).join(" · ");

// ── tema e conforto visual ──────────────────────────────────────────────
export const PASTEIS = ["", "#fde2e4", "#fff1c1", "#e2f0cb", "#cdeac0", "#d6eaf8", "#e8dff5", "#fce1e4", "#ddedea", "#f9e8d2"];
const ESCALAS = { "-2": 0.8, "-1": 0.9, "0": 1, "1": 1.15, "2": 1.32 };
const TEMA_PADRAO = { modo: "claro", pastel: "", fonte: 0, veu: 0.7, temFundo: false };

export function tema() { return { ...TEMA_PADRAO, ...ler("tema", {}) }; }

export async function aplicarTema(raiz) {
  const t = tema();
  raiz.dataset.modo = t.modo;
  raiz.style.setProperty("--odin-escala", ESCALAS[String(t.fonte)] ?? 1);
  raiz.style.setProperty("--odin-pastel", t.pastel || "transparent");
  raiz.style.setProperty("--odin-veu", t.temFundo ? Math.min(0.9, Math.max(0.5, t.veu)) : 0);
  const u = t.temFundo ? await imgUrl("fundo:pagina") : null;
  raiz.style.setProperty("--odin-imagem", u ? `url("${u}")` : "none");
}

/** Barra A-- A- A A+ A++ · modos · paleta pastel · imagem de fundo · véu 50–90 %. */
export function barraConforto(raiz, aoMudar = () => {}) {
  const b = document.createElement("div");
  b.className = "odin-conforto odin-nao-imprimir";
  const t = tema();
  const rotulos = [["-2", "A--"], ["-1", "A-"], ["0", "A"], ["1", "A+"], ["2", "A++"]];
  b.innerHTML = `
    <span class="odin-fontes" role="group" aria-label="Tamanho do texto">${rotulos.map(([v, r]) =>
      `<button data-fonte="${v}" aria-pressed="${String(t.fonte) === v}" title="Texto ${r}">${r}</button>`).join("")}</span>
    <span role="group" aria-label="Modo de cor">
      <button data-modo="claro" aria-pressed="${t.modo === "claro"}" title="Modo claro">☀</button>
      <button data-modo="cinza" aria-pressed="${t.modo === "cinza"}" title="Modo cinza">◐</button>
      <button data-modo="escuro" aria-pressed="${t.modo === "escuro"}" title="Modo escuro">☾</button>
    </span>
    <span role="group" aria-label="Fundo pastel">${PASTEIS.map((c) =>
      `<button class="odin-pastel" data-pastel="${c}" title="${c ? "Fundo " + c : "Sem cor"}" style="background:${c || "linear-gradient(135deg,#fff 45%,#d33 50%,#fff 55%)"}"></button>`).join("")}</span>
    <label class="odin-btn" title="Imagem de fundo da página">🖼<input type="file" accept="image/*" data-fundo></label>
    <label title="Transparência do véu sobre a imagem (50–90 %)"><span class="odin-sr">Véu</span>
      <input type="range" min="50" max="90" step="5" value="${Math.round(t.veu * 100)}" data-veu></label>
    <button data-semfundo title="Remover imagem de fundo">✕🖼</button>`;
  const mudar = async (parcial) => {
    gravar("tema", { ...tema(), ...parcial });
    await aplicarTema(raiz);
    b.querySelectorAll("[data-fonte]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.fonte === String(tema().fonte)));
    b.querySelectorAll("[data-modo]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.modo === tema().modo));
    aoMudar(tema());
  };
  b.addEventListener("click", (e) => {
    const x = e.target.closest("button"); if (!x) return;
    if (x.dataset.fonte !== undefined) mudar({ fonte: Number(x.dataset.fonte) });
    else if (x.dataset.modo) mudar({ modo: x.dataset.modo });
    else if (x.dataset.pastel !== undefined) mudar({ pastel: x.dataset.pastel });
    else if (x.hasAttribute("data-semfundo")) imgGravar("fundo:pagina", null).then(() => mudar({ temFundo: false }));
  });
  b.querySelector("[data-veu]").addEventListener("input", (e) => mudar({ veu: Number(e.target.value) / 100 }));
  b.querySelector("[data-fundo]").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await imgGravar("fundo:pagina", await reduzirImagem(f)); await mudar({ temFundo: true }); toast("🖼 Fundo aplicado"); }
    catch (err) { toast("⚠️ " + err.message); }
    e.target.value = "";
  });
  return b;
}

// ── Jornal: renderizador único (página Jornal + Jornal EXCLUSIVO do Portal) ──
export function jornalHTML({ titulo = "O Diário ODIN", subtitulo = "", dia, manchete, colunas, exclusivo = false }) {
  const col = (c) => {
    const [top, ...resto] = c.manchetes;
    if (!top) return "";
    return `<section class="odin-j-col" data-col="${esc(c.id)}">
      <h3 class="odin-j-kicker">${esc(c.emoji || "")} ${esc(c.nome)}</h3>
      <h2 class="odin-j-h"><a href="${esc(top.link)}" target="_blank" rel="noopener">${esc(top.titulo)}</a></h2>
      ${top.resumo ? `<p class="odin-j-r">${esc(truncar(top.resumo, 360))}</p>` : ""}
      <p class="odin-j-meta">${esc(top.fonte)}${top.nFontes > 1 ? ` · ${top.nFontes} fontes` : ""}${top.data ? " · " + fmtData(top.data) : ""}</p>
      ${top.tags?.length ? `<p class="odin-j-tags">${top.tags.slice(0, 5).map((g) => `<span>#${esc(g)}</span>`).join(" ")}</p>` : ""}
      ${resto.length ? `<ul class="odin-j-mais">${resto.slice(0, 6).map((m) => `<li><a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.titulo)}</a> <small>${esc(m.fonte)}</small></li>`).join("")}</ul>` : ""}
    </section>`;
  };
  return `<article class="odin-jornal">
    <header class="odin-j-cab">
      <div class="odin-j-faixa"><span>${esc(dataLonga(dia))}</span><span>${exclusivo ? "EDIÇÃO EXCLUSIVA · SOB MEDIDA" : "EDIÇÃO DIÁRIA"}</span><span>ProfBru © 2026</span></div>
      <h1 class="odin-j-titulo">${esc(titulo)}</h1>
      <span class="odin-dica" data-dica="ODIN - On Demand Information and News" tabindex="0"><img class="odin-j-olho" src="${new URL(rota("/odin/odin-logo-pb.png"), location.href).href}" alt="ODIN - On Demand Information and News" title="ODIN - On Demand Information and News" width="190" height="119" decoding="async"></span>
      <div class="odin-j-sub">${esc(subtitulo || "Primeira página — as manchetes de cada coluna, resumidas e etiquetadas")}</div>
    </header>
    ${manchete ? `<section class="odin-j-manchete">
      <h2><a href="${esc(manchete.link)}" target="_blank" rel="noopener">${esc(manchete.titulo)}</a></h2>
      ${manchete.pos?.length ? `<p class="odin-j-pos" aria-label="Manchete etiquetada por classe gramatical">${posHTML(manchete.pos)}</p><p class="odin-j-leg">${POS_LEGENDA}</p>` : ""}
      ${manchete.resumo ? `<p class="odin-j-r">${esc(manchete.resumo)}</p>` : ""}
      <p class="odin-j-meta">${esc(manchete.fonte)}${manchete.n_fontes > 1 ? ` · repercutida em ${manchete.n_fontes} fontes` : ""}</p>
    </section>` : ""}
    <div class="odin-j-grade">${colunas.map(col).join("")}</div>
    <footer class="odin-j-rodape">ODIN — On Demand Information and News · Autor: ProfBru - Bruno Penedo © 2026 — TODOS OS DIREITOS RESERVADOS</footer>
  </article>`;
}

export const JORNAL_CSS = `
.odin-jornal{font-family:Georgia,"Times New Roman",serif;color:var(--odin-texto,#111);max-width:1280px;margin:0 auto;padding:12px 18px}
.odin-jornal a{color:inherit;text-decoration:none}.odin-jornal a:hover{text-decoration:underline}
.odin-j-faixa{display:flex;justify-content:space-between;gap:8px;font:600 .78em Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;border-top:3px double currentColor;border-bottom:1px solid currentColor;padding:4px 0}
.odin-j-titulo{font:900 3.4em/1 "Old English Text MT","UnifrakturCook",Georgia,serif;text-align:center;margin:.18em 0 .05em;letter-spacing:.01em}
.odin-j-cab .odin-dica{display:block;width:max-content;margin:0 auto}
.odin-j-olho{display:block;margin:.15em auto .4em;width:clamp(150px,15vw,210px);height:auto;opacity:.95}
.odin-app[data-modo="escuro"] .odin-j-olho{filter:invert(1)}
@media print{.odin-j-olho{width:150px}}
.odin-j-sub{text-align:center;font-style:italic;border-bottom:3px double currentColor;padding-bottom:6px;margin-bottom:10px}
.odin-j-manchete{border-bottom:2px solid currentColor;padding-bottom:10px;margin-bottom:12px;text-align:center}
.odin-j-manchete h2{font:800 2.3em/1.12 Georgia,serif;margin:.15em 0}
.odin-j-pos{font:1.05em/1.9 Georgia,serif;margin:.3em auto;max-width:900px}.odin-j-leg{font:.75em Arial,sans-serif;color:var(--odin-suave,#555)}
.odin-j-grade{display:grid;grid-template-columns:repeat(4,1fr);gap:0}
.odin-j-col{padding:6px 12px 12px;border-right:1px solid var(--odin-borda,#bbb);border-bottom:1px solid var(--odin-borda,#bbb);break-inside:avoid}
.odin-j-kicker{font:700 .74em Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--odin-destaque,#b91c1c);margin:.2em 0 .3em}
.odin-j-h{font:700 1.28em/1.18 Georgia,serif;margin:.1em 0 .35em}
.odin-j-r{font-size:.98em;line-height:1.42;text-align:justify;hyphens:auto;margin:.2em 0}
.odin-j-meta{font:.74em Arial,sans-serif;color:var(--odin-suave,#666);margin:.25em 0}
.odin-j-tags span{font:.72em Arial,sans-serif;background:#0001;border-radius:3px;padding:1px 4px;margin-right:2px;display:inline-block}
.odin-j-mais{margin:.5em 0 0;padding:.4em 0 0 1em;border-top:1px dotted var(--odin-borda,#bbb);font-size:.9em}.odin-j-mais li{margin:.25em 0}.odin-j-mais small{color:var(--odin-suave,#777);font-family:Arial,sans-serif}
.odin-j-rodape{text-align:center;font:.75em Arial,sans-serif;border-top:3px double currentColor;margin-top:12px;padding-top:6px}
@media(max-width:1100px){.odin-j-grade{grid-template-columns:repeat(3,1fr)}}
@media(max-width:820px){.odin-j-grade{grid-template-columns:repeat(2,1fr)}.odin-j-titulo{font-size:2.5em}}
@media(max-width:540px){.odin-j-grade{grid-template-columns:1fr}.odin-j-manchete h2{font-size:1.6em}.odin-j-faixa{flex-direction:column;align-items:center}}
@media print{.odin-jornal{max-width:none}.odin-j-grade{grid-template-columns:repeat(4,1fr)}a{color:#000}}`;

/** Abre uma janela com documento autocontido (relatório PDF / jornal exclusivo) e dispara a impressão. */
export function abrirDocumento(titulo, corpoHTML, css, imprimir = true) {
  const w = window.open("", "_blank");
  if (!w) { toast("⚠️ Permita pop-ups para gerar o documento"); return null; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="author" content="ProfBru - Bruno Penedo © 2026"><style>body{margin:0;background:#fff}${css}</style></head>
<body>${corpoHTML}${imprimir ? "<script>window.onload=()=>setTimeout(()=>print(),300)<\/script>" : ""}</body></html>`);
  w.document.close();
  return w;
}

export function baixar(nome, conteudo, tipo = "application/json") {
  const u = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: u, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

// ── motor em tempo real (SSE do motor Elixir, quando acessível) ─────────
export function tempoReal(aoChegar) {
  // site público (GitHub Pages) não tem motor: sem SSE, sem requisição bloqueada a 127.0.0.1
  // (com caminho-base o build é o do site público, mesmo quando testado em 127.0.0.1)
  if (!ler("motor", "") && (!LOCAL || BASE)) return () => {};
  const base = ler("motor", "http://127.0.0.1:8711");
  try {
    const es = new EventSource(base + "/api/eventos");
    es.addEventListener("itens", (e) => aoChegar(JSON.parse(e.data)));
    es.onerror = () => es.close();                       // motor desligado: o painel segue com o painel.json
    return () => es.close();
  } catch { return () => {}; }
}
