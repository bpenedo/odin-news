// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// FdRSS — leitor pessoal FLEXÍVEL: cartões, modo por feed (Rio = linha do tempo principal,
// Só no feed = aparece só ao abrir o feed, Radar = discreto, para quando não há mais nada),
// filtros incluir/excluir por feed, termos em alta, atalhos de teclado (j k o s m), lidos/não lidos,
// itens novos em tempo real (SSE do motor Elixir) e exportação OPML. Estado local.

const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
const { aplicarTema, barraConforto, carregarCss, carregarPainel, debounce, dominio, esc, fmtData, gravar, ler, toast, truncar, tempoReal, baixar } = await import("./comum.js" + VERSAO);

const CSS = `
.fd-app{display:grid;grid-template-columns:260px 1fr;min-height:78vh;font:calc(14px*var(--odin-escala))/1.45 Roboto,"Segoe UI",Arial,sans-serif}
.fd-lat{border-right:1px solid var(--odin-borda);padding:10px 8px;overflow:auto;max-height:84vh}
.fd-lat h5{margin:12px 6px 4px;font:700 .72em Arial;text-transform:uppercase;letter-spacing:.08em;color:var(--odin-suave)}
.fd-feed{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:.88em}
.fd-feed:hover{background:color-mix(in srgb,var(--odin-texto) 7%,transparent)}.fd-feed[aria-current=true]{background:color-mix(in srgb,#4285f4 15%,transparent);font-weight:700}
.fd-feed .fd-n{margin-left:auto;font-size:.8em;color:var(--odin-suave)}.fd-feed .fd-modo{font-size:.75em;border:0;background:transparent;cursor:pointer}
.fd-main{padding:12px 20px;min-width:0}
.fd-cab{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.fd-cab h2{margin:0 auto 0 0;font:500 1.4em Roboto,Arial}
.fd-cab input,.fd-cab select,.fd-cab button{font:inherit;font-size:.85em;border:1px solid var(--odin-borda);background:var(--odin-cartao);color:var(--odin-texto);border-radius:16px;padding:5px 12px}
.fd-trend{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 12px}.fd-trend button{font:500 .78em Arial;border:1px solid var(--odin-borda);background:var(--odin-cartao);color:var(--odin-texto);border-radius:14px;padding:3px 10px;cursor:pointer}
.fd-trend button[aria-pressed=true]{background:#4285f4;color:#fff;border-color:#4285f4}
.fd-cartoes{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.fd-c{background:var(--odin-cartao);border-radius:10px;box-shadow:0 1px 3px #0002,0 1px 2px #0001;overflow:hidden;display:flex;flex-direction:column;outline:none;transition:box-shadow .15s}
.fd-c:focus,.fd-c.fd-at{box-shadow:0 0 0 3px #4285f4}.fd-c.fd-lido{opacity:.55}
.fd-c img{width:100%;aspect-ratio:2/1;object-fit:cover;display:block;background:#eee}
.fd-c .fd-in{padding:12px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
.fd-c .fd-src{font:500 .75em Arial;color:var(--odin-suave);display:flex;gap:6px;align-items:center}

.fd-c h3{margin:0;font:500 1.05em/1.3 Roboto,Arial}.fd-c h3 a{color:var(--odin-texto);text-decoration:none}.fd-c h3 a:hover{text-decoration:underline}
.fd-c p{margin:0;font-size:.88em;color:var(--odin-suave)}
.fd-c .fd-ac{display:flex;gap:2px;margin-top:auto;padding-top:4px}.fd-c .fd-ac button{border:0;background:transparent;cursor:pointer;color:var(--odin-suave);font-size:1em;padding:3px 6px;border-radius:5px}
.fd-c .fd-ac button:hover{background:color-mix(in srgb,var(--odin-texto) 8%,transparent)}
.fd-radar{margin-top:22px;border-top:1px dashed var(--odin-borda);padding-top:10px}.fd-radar h4{margin:0 0 8px;font:500 1em Arial;color:var(--odin-suave)}
.fd-radar li{margin:4px 0;font-size:.9em}
.fd-novas{position:sticky;top:6px;z-index:3;display:none;margin:0 auto 10px;width:max-content;background:#4285f4;color:#fff;border:0;border-radius:16px;padding:6px 14px;cursor:pointer;box-shadow:0 2px 6px #0003}
.fd-ajuda{font-size:.75em;color:var(--odin-suave)}
@media(max-width:820px){.fd-app{grid-template-columns:1fr}.fd-lat{max-height:34vh;border-right:0;border-bottom:1px solid var(--odin-borda)}}`;

export async function montar(raiz) {
  carregarCss("/odin/temas.css");
  if (!document.getElementById("fd-css")) document.head.appendChild(Object.assign(document.createElement("style"), { id: "fd-css", textContent: CSS }));
  raiz.classList.add("odin-app", "fd-app");
  await aplicarTema(raiz);
  const p = await carregarPainel();
  let itens = p.itens.slice();
  const modos = ler("fdModos", {});              // feed → rio | feed | radar
  const filtros = ler("fdFiltros", {});          // feed → {incluir, excluir}
  let lidos = new Set(ler("fdLidos", []));
  const ui = { feed: "", busca: "", termo: "", soNaoLidos: false };
  let novasPendentes = [];

  const feeds = () => {
    const m = new Map();
    for (const i of itens) { const f = m.get(i.feed) || { url: i.feed, nome: i.fonte, coluna: i.coluna, n: 0, nl: 0 }; f.n++; if (!lidos.has(i.id)) f.nl++; m.set(i.feed, f); }
    return [...m.values()].sort((a, b) => a.coluna.localeCompare(b.coluna) || b.n - a.n);
  };
  const modo = (f) => modos[f] || "rio";
  const passaFiltro = (i) => {
    const f = filtros[i.feed]; if (!f) return true;
    const txt = (i.titulo + " " + i.resumo).toLowerCase();
    if (f.incluir && !f.incluir.split(",").some((t) => t.trim() && txt.includes(t.trim().toLowerCase()))) return false;
    if (f.excluir && f.excluir.split(",").some((t) => t.trim() && txt.includes(t.trim().toLowerCase()))) return false;
    return true;
  };

  raiz.innerHTML = `<nav class="fd-lat" aria-label="Feeds"></nav><main class="fd-main">
    <div class="fd-cab"><h2 data-titulo>Rio</h2><input type="search" placeholder="Filtrar…" data-busca>
      <label><input type="checkbox" data-naolidos> só não lidas</label><button data-opml>⬇ OPML</button><button data-todoslidos>✓ marcar visíveis como lidas</button><span data-conf></span></div>
    <div class="fd-trend" data-trend></div><button class="fd-novas" data-novas></button>
    <div class="fd-cartoes" data-cartoes></div><div class="fd-radar" data-radar></div>
    <p class="fd-ajuda">Atalhos: <b>j</b>/<b>k</b> próxima/anterior · <b>o</b> abrir · <b>s</b> guardar na Estante · <b>m</b> lida/não lida</p></main>`;
  raiz.querySelector("[data-conf]").appendChild(barraConforto(raiz));
  const $ = (s) => raiz.querySelector(s);

  function desenharLat() {
    const fs = feeds(); let html = `<div class="fd-feed" data-feed="" aria-current="${!ui.feed}">🌊 Rio (todas)</div>`;
    let colAnt = "";
    for (const f of fs) {
      if (f.coluna !== colAnt) { colAnt = f.coluna; const c = p.nomeCat[f.coluna]; html += `<h5>${esc(c?.emoji || "")} ${esc(c?.nome || f.coluna)}</h5>`; }
      const m = modo(f.url);
      html += `<div class="fd-feed" data-feed="${esc(f.url)}" aria-current="${ui.feed === f.url}" title="${esc(f.url)}">
        <button class="fd-modo" data-modo="${esc(f.url)}" title="Modo: ${m === "rio" ? "Rio" : m === "feed" ? "Só no feed" : "Radar"} (clique para trocar)">${m === "rio" ? "🌊" : m === "feed" ? "📁" : "📡"}</button>
        ${esc(truncar(f.nome, 28))}<span class="fd-n">${f.nl || ""}</span></div>`;
    }
    $(".fd-lat").innerHTML = html;
  }
  function trending(lst) {
    const c = new Map(); lst.forEach((i) => i.tags.slice(0, 3).forEach((t) => c.set(t, (c.get(t) || 0) + 1)));
    return [...c].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]).slice(0, 14);
  }
  let visiveis = [], atual = -1;
  function desenhar() {
    desenharLat();
    const q = ui.busca.toLowerCase();
    let base = itens.filter(passaFiltro);
    if (ui.feed) base = base.filter((i) => i.feed === ui.feed);
    const radar = ui.feed ? [] : base.filter((i) => modo(i.feed) === "radar");
    let lst = ui.feed ? base : base.filter((i) => modo(i.feed) === "rio");
    if (q) lst = lst.filter((i) => (i.titulo + i.resumo + i.fonte).toLowerCase().includes(q));
    if (ui.termo) lst = lst.filter((i) => i.tags.includes(ui.termo));
    if (ui.soNaoLidos) lst = lst.filter((i) => !lidos.has(i.id));
    lst.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    visiveis = lst.slice(0, 300);
    $("[data-titulo]").textContent = ui.feed ? (feeds().find((f) => f.url === ui.feed)?.nome || "Feed") : "Rio";
    $("[data-trend]").innerHTML = `<small style="align-self:center;color:var(--odin-suave)">Em alta:</small>` + trending(base).map(([t, n]) => `<button data-termo="${esc(t)}" aria-pressed="${ui.termo === t}">#${esc(t)} <small>${n}</small></button>`).join("");
    $("[data-cartoes]").innerHTML = visiveis.map((i, k) => `<article class="fd-c ${lidos.has(i.id) ? "fd-lido" : ""} ${k === atual ? "fd-at" : ""}" tabindex="0" data-k="${k}">
      ${i.imagem ? `<img src="${esc(i.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
      <div class="fd-in"><div class="fd-src"><b style="display:inline-grid;place-items:center;width:16px;height:16px;border-radius:3px;background:#4285f4;color:#fff;font-size:10px">${esc((i.fonte || dominio(i.link) || "?").trim()[0] || "?")}</b>${esc(i.fonte)} · ${esc(fmtData(i.data))}</div>
      <h3><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.titulo)}</a></h3>${i.resumo ? `<p>${esc(truncar(i.resumo, 180))}</p>` : ""}
      <div class="fd-ac"><button data-a="lida" title="Lida/não lida (m)">${lidos.has(i.id) ? "◉" : "○"}</button><button data-a="estante" title="Guardar na Estante (s)">🔖</button><button data-a="filtro" title="Filtros deste feed">⚙</button></div></div></article>`).join("")
      || `<p style="color:var(--odin-suave)">Nada aqui — ajuste filtros ou modos dos feeds.</p>`;
    $("[data-radar]").innerHTML = radar.length ? `<h4>📡 Radar — ${radar.length} itens discretos</h4><ul>${radar.slice(0, 40).map((i) => `<li><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.titulo)}</a> <small>${esc(i.fonte)}</small></li>`).join("")}</ul>` : "";
  }
  const salvarLidos = () => gravar("fdLidos", [...lidos].slice(-5000));
  function acao(a, i) {
    if (a === "lida") { lidos.has(i.id) ? lidos.delete(i.id) : lidos.add(i.id); salvarLidos(); }
    if (a === "estante") {
      const est = ler("estante", []);
      if (!est.some((x) => x.id === i.id)) { est.unshift({ id: i.id, url: i.link, titulo: i.titulo, fonte: i.fonte, resumo: i.resumo, tags: i.tags, imagem: i.imagem, coluna: i.coluna, salvo: new Date().toISOString(), destaques: [] }); gravar("estante", est); toast("🔖 Guardada na Estante"); }
    }
    if (a === "filtro") {
      const f = filtros[i.feed] || {};
      const inc = prompt(`Feed: ${i.fonte}\nINCLUIR só itens com (termos separados por vírgula; vazio = todos):`, f.incluir || ""); if (inc === null) return;
      const exc = prompt("EXCLUIR itens com (termos separados por vírgula):", f.excluir || ""); if (exc === null) return;
      filtros[i.feed] = { incluir: inc, excluir: exc }; gravar("fdFiltros", filtros);
    }
    desenhar();
  }

  $(".fd-lat").addEventListener("click", (e) => {
    const m = e.target.closest("[data-modo]");
    if (m) { const ord = ["rio", "feed", "radar"]; modos[m.dataset.modo] = ord[(ord.indexOf(modo(m.dataset.modo)) + 1) % 3]; gravar("fdModos", modos); e.stopPropagation(); return desenhar(); }
    const f = e.target.closest("[data-feed]"); if (f) { ui.feed = f.dataset.feed; atual = -1; desenhar(); }
  });
  $("[data-trend]").addEventListener("click", (e) => { const b = e.target.closest("[data-termo]"); if (!b) return; ui.termo = ui.termo === b.dataset.termo ? "" : b.dataset.termo; desenhar(); });
  $("[data-cartoes]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); const c = e.target.closest("[data-k]"); if (!c) return;
    const i = visiveis[Number(c.dataset.k)];
    if (b) return acao(b.dataset.a, i);
    if (e.target.closest("a")) { lidos.add(i.id); salvarLidos(); setTimeout(desenhar, 50); }
  });
  $("[data-busca]").addEventListener("input", debounce((e) => { ui.busca = e.target.value; desenhar(); }, 80));
  $("[data-naolidos]").addEventListener("change", (e) => { ui.soNaoLidos = e.target.checked; desenhar(); });
  $("[data-todoslidos]").onclick = () => { visiveis.forEach((i) => lidos.add(i.id)); salvarLidos(); desenhar(); };
  $("[data-opml]").onclick = () => baixar("odin-fdrss.opml", `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>ODIN FdRSS</title></head><body>${
    p.categorias.map((c) => `<outline text="${esc(c.nome)}">${feeds().filter((f) => f.coluna === c.id).map((f) => `<outline type="rss" text="${esc(f.nome)}" xmlUrl="${esc(f.url)}"/>`).join("")}</outline>`).join("")}</body></opml>`, "text/x-opml");
  raiz.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "j" || e.key === "k") { atual = Math.max(0, Math.min(visiveis.length - 1, atual + (e.key === "j" ? 1 : -1))); desenhar(); raiz.querySelector(`[data-k="${atual}"]`)?.focus(); }
    const i = visiveis[atual]; if (!i) return;
    if (e.key === "o") { window.open(i.link, "_blank", "noopener"); lidos.add(i.id); salvarLidos(); desenhar(); }
    if (e.key === "s") acao("estante", i);
    if (e.key === "m") acao("lida", i);
  });
  const bNovas = $("[data-novas]");
  bNovas.onclick = () => { itens = [...novasPendentes, ...itens]; novasPendentes = []; bNovas.style.display = "none"; desenhar(); };
  tempoReal((novos) => {
    const ids = new Set(itens.map((i) => i.id));
    for (const x of novos) if (!ids.has(x.id)) novasPendentes.push({ id: x.id, coluna: x.coluna, titulo: x.titulo, link: x.link, fonte: x.fonte, feed: x.feed, data: x.publicado, resumo: x.resumo, tags: [], imagem: x.imagem || "" });
    if (novasPendentes.length) { bNovas.textContent = `⚡ ${novasPendentes.length} novas — mostrar`; bNovas.style.display = "block"; }
  });
  desenhar();
}
