// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Portal de feeds (look & feel de portal agregador clássico).
// As caixas são montadas DINAMICAMENTE a partir de /odin/feeds/<categoria>.xml (RSS 2.0 gerado
// todo dia pelo pipeline). Busca em tempo real em todas as categorias, ordenação, arrastar-e-soltar,
// categorias ilimitadas (virtuais, por termos), alertas, relatório PDF, Jornal EXCLUSIVO sob medida,
// fundos por categoria com véu 50–90 %, conforto visual. Estado 100 % local.

const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
const {
  aplicarTema, barraConforto, carregarCss, carregarPainel, debounce, esc, fmtData, gravar, imgGravar, imgUrl,
  jornalHTML, JORNAL_CSS, abrirDocumento, baixar, ler, reduzirImagem, rota, tema, toast, truncar, tempoReal,
} = await import("./comum.js" + VERSAO);

const RSS_SVG = `<svg class="op-rss" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#f58220"/><circle cx="4.3" cy="11.7" r="1.6" fill="#fff"/><path d="M2.7 7.2a6.1 6.1 0 0 1 6.1 6.1h-2a4.1 4.1 0 0 0-4.1-4.1zM2.7 3.2a10.1 10.1 0 0 1 10.1 10.1h-2a8.1 8.1 0 0 0-8.1-8.1z" fill="#fff"/></svg>`;
const LUPA_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.3 10.3 15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MARCA_SVG = `<svg class="op-marca" viewBox="0 0 150 112" role="img" aria-label="ODIN Portal"><title>ODIN - On Demand Information and News</title><rect x="3" y="3" width="144" height="106" rx="14" fill="#f4fbff" stroke="#49a5d3" stroke-width="3"/><text x="75" y="62" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="44" fill="#004080">ODIN</text><text x="75" y="88" text-anchor="middle" font-family="Arial" font-size="14" letter-spacing="3" fill="#49a5d3">PORTAL</text><g transform="translate(118 18)">${'<rect width="18" height="18" rx="4" fill="#f58220"/><circle cx="5" cy="13" r="2" fill="#fff"/><path d="M3 8a7 7 0 0 1 7 7H8a5 5 0 0 0-5-5zM3 3a12 12 0 0 1 12 12h-2A10 10 0 0 0 3 5z" fill="#fff"/>'}</g></svg>`;

const normalizar = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function montar(raiz, paramCat = "", opcoes = {}) {
  // TELA CHEIA: mesmo Portal (topo completo), cobrindo a janela — sem o menu lateral do painel.
  // A categoria vem por ?c=<categoria> (funciona em hospedagem estática, como o GitHub Pages).
  const telaCheia = opcoes.modo === "tela-cheia";
  if (telaCheia) paramCat = new URLSearchParams(location.search).get("c") || "";
  const pagina = (cat) => telaCheia ? rota("/portal-tela-cheia" + (cat ? `?c=${encodeURIComponent(cat)}` : "")) : rota(cat ? `/portal/${cat}` : "/portal");
  const tInicio = performance.now();               // ms da página: do 1º fetch ao último TD desenhado
  carregarCss("/odin/temas.css");
  carregarCss("/odin/portal.css");
  raiz.classList.add("odin-app", "odin-portal");
  if (telaCheia) { raiz.classList.add("op-tela-cheia"); document.documentElement.classList.add("op-sem-rolagem"); }
  await aplicarTema(raiz);

  const painel = await carregarPainel();
  const cfg = { resumoX: 200, tituloX: 32, linhas: 12, aba: "todas", sort: "data-desc", ...ler("portal", {}) };
  const salvarCfg = () => gravar("portal", cfg);
  let sel = new Set(ler("selecao", []));
  let alertas = ler("alertas", []);
  let verAlertas = 0;                                // versão: invalida o 🔔 memorizado por notícia
  const salvarAlertas = () => { gravar("alertas", alertas); verAlertas++; };
  let virtuais = ler("categoriasVirtuais", []);
  let expandidas = new Set();
  const chaveOrdem = paramCat ? "ordem:" + paramCat : "ordemCats";
  const catAtual = paramCat ? painel.categorias.find((c) => c.id === paramCat) : null;
  if (paramCat && !catAtual) { raiz.innerHTML = `<p>Categoria desconhecida: ${esc(paramCat)}</p>`; return; }
  let busca = "";

  // ── dados: 1 arquivo .xml por categoria, lidos em paralelo ───────────────
  const parser = new DOMParser();
  async function lerXml(cat) {
    try {
      const r = await fetch(rota(`/odin/feeds/${cat.id}.xml`), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const doc = parser.parseFromString(await r.text(), "application/xml");
      return [...doc.querySelectorAll("item")].map((it) => {
        const q = (s) => it.querySelector(s)?.textContent || "";
        const src = it.querySelector("source");
        return { id: q("guid"), titulo: q("title"), link: q("link"), resumo: q("description"),
                 data: q("pubDate") ? new Date(q("pubDate")).toISOString() : "", fonte: src?.textContent || "",
                 feed: src?.getAttribute("url") || "", tags: [...it.querySelectorAll("category")].map((c) => c.textContent),
                 coluna: cat.id };
      });
    } catch { return null; }                                // null → caixa "Erro ao obter informações"
  }
  const porCat = new Map();
  // página "Todas": 14 XMLs agregados; página de categoria: só o .txt dela (abaixo) — nada a mais na rede
  const lidos = paramCat ? [] : await Promise.all(painel.categorias.map(lerXml));
  painel.categorias.forEach((c, k) => porCat.set(c.id, lidos[k]));
  let todos = lidos.flat().filter(Boolean);
  const indexar = (i) => { i._h = normalizar(`${i.titulo} ${i.resumo} ${i.fonte} ${i.tags.join(" ")}`); return i; };
  todos.forEach(indexar);

  // ── página POR CATEGORIA: o índice .txt (gerado do config/feeds/<cat>.txt editado à mão) é lido
  //    linha a linha num FOR LOOP; cada linha vira uma TABLE com o espelho local do feed.
  let caixasFeed = [];
  if (paramCat) {
    const txt = await (await fetch(rota(`/odin/feeds/${paramCat}.txt`), { cache: "no-store" })).text();
    const linhas = txt.split("\n");
    const promessas = [];
    for (let k = 0; k < linhas.length; k++) {                 // FOR LOOP sobre o arquivo .txt
      const l = linhas[k].trim();
      if (!l || l[0] === "#") continue;
      const [nome, arquivo, original] = l.split(" | ");
      promessas.push(fetch(rota(arquivo), { cache: "no-store" })   // índice traz caminho absoluto: aplica a base do site
        .then((r) => r.text()).then((x) => {
        const doc = parser.parseFromString(x, "application/xml");
        const erro = doc.querySelector("parsererror") ? "XML inválido" : (doc.getElementsByTagName("odin:erro")[0]?.textContent || "");
        const its = [...doc.querySelectorAll("item")].map((it) => {
          const q = (s) => it.querySelector(s)?.textContent || "";
          return indexar({ id: q("guid"), titulo: q("title"), link: q("link"), resumo: q("description"),
            data: q("pubDate") ? new Date(q("pubDate")).toISOString() : "", fonte: nome, feed: original,
            tags: [...it.querySelectorAll("category")].map((c) => c.textContent), coluna: paramCat });
        });
        return { id: "f-" + arquivo.split("/").pop().replace(".xml", ""), nome, emoji: "", url: original, erro, itens: its.length ? its : (erro ? null : []) };
      }).catch(() => ({ id: "f-" + k, nome, emoji: "", url: original, erro: "falha", itens: null })));
    }
    caixasFeed = await Promise.all(promessas);
    todos = caixasFeed.flatMap((c) => c.itens || []);
  }

  const categorias = () => paramCat ? caixasFeed : [
    ...painel.categorias.map((c) => ({ ...c, itens: porCat.get(c.id) })),
    ...virtuais.map((v) => ({ id: v.id, nome: v.nome, emoji: "✳️", virtual: true, termos: v.termos,
      itens: todos.filter((i) => v.termos.some((t) => i._h.includes(normalizar(t)))) })),
  ];

  // ── esqueleto ────────────────────────────────────────────────────────────
  raiz.innerHTML = `
    <div class="op-topo">
      <div class="op-logo" title="ODIN - On Demand Information and News">${MARCA_SVG}<span class="odin-dica" data-dica="ODIN - On Demand Information and News" tabindex="0"><img class="op-olho" src="${rota("/odin/odin-logo.png")}" alt="ODIN - On Demand Information and News" title="ODIN - On Demand Information and News" width="230" height="150" decoding="async"></span>${catAtual ? `<div style="font:bold 1.6em Arial;color:#49a5d3;letter-spacing:2px;text-transform:uppercase">${esc(catAtual.emoji)} ${esc(catAtual.nome)}</div>` : ""}<small>${esc(painel.dia.split("-").reverse().join("/"))} · feeds atualizados diariamente</small></div>
      <div class="op-dir">
        <div class="op-conf-slot"></div>
        <div class="op-linha">
          <label>Ordenar <select data-sort>
            <option value="data-desc">Data e hora ↓ (recentes)</option>
            <option value="data-asc">Data e hora ↑ (antigas)</option>
            <option value="cat-az">Categoria A → Z</option>
            <option value="cat-za">Categoria Z → A</option>
            <option value="pers">Minha ordem (arrastar)</option>
          </select></label>
          <label>Resumo <select data-resumo>${[120, 200, 280, 400].map((n) => `<option value="${n}">${n} car.</option>`).join("")}</select></label>
        </div>
        <div class="op-busca">${LUPA_SVG}<input type="search" placeholder="Buscar em todas as categorias…" aria-label="Buscar notícias" data-busca></div>
      </div>
    </div>
    <nav class="op-abas" aria-label="Categorias"></nav>
    <div class="op-sel odin-nao-imprimir">
      <span><span class="op-cont" data-cont>0</span> selecionadas</span>
      <button data-acao="vis">☑ Selecionar visíveis</button>
      <button data-acao="limpar">✕ Limpar</button>
      <button class="op-prim" data-acao="pdf">📄 Relatório PDF</button>
      <button class="op-prim" data-acao="jornal">📰 Jornal exclusivo</button>
      <button data-acao="flip">⇄ Folhear (Flip)</button>
      <button data-acao="grafo">🕸 Grafo</button>
      <button data-acao="alertas">🔔 Alertas (<span data-nalertas>0</span>)</button>
      ${paramCat ? `<a href="${rota(`/odin/feeds/${esc(paramCat)}.txt`)}" target="_blank" style="font:11px Arial" title="Feeds desta página: edite config/feeds/${esc(paramCat)}.txt">📄 ${esc(paramCat)}.txt</a>` : `<button data-acao="novacat">＋ Categoria</button>`}
      ${telaCheia
        ? `${document.fullscreenEnabled ? `<button data-acao="monitor" title="Ocupar o monitor inteiro (Esc sai)">⛶ Monitor inteiro</button>` : ""}<a class="op-btn-link" href="${paramCat ? rota(`/portal/${esc(paramCat)}`) : rota("/portal")}" title="Voltar ao painel com o menu lateral">⤢ Sair da tela cheia</a>`
        : `<a class="op-btn-link" href="${esc(rota("/portal-tela-cheia" + (paramCat ? `?c=${encodeURIComponent(paramCat)}` : "")))}" title="Portal em tela cheia, sem o menu lateral">⛶ Tela cheia</a>`}
      <span data-status style="margin-left:auto;color:var(--odin-suave)"></span>
    </div>
    <div class="op-paineis"></div>
    <div class="op-grade" role="list"></div>
    <div class="op-info" role="tooltip" hidden></div>
    <div class="op-rodape">Gostaria de acompanhar outra fonte? Acrescente o feed em <code>config/colunas.json</code> ou crie uma categoria com ＋ Categoria.<br>
      ODIN — On Demand Information and News · ProfBru - Bruno Penedo © 2026 — TODOS OS DIREITOS RESERVADOS</div>`;
  raiz.querySelector(".op-conf-slot").appendChild(barraConforto(raiz, () => desenhar()));
  // MODO LIMPO (todas as páginas do Portal): um botão flutuante oculta topo, abas, seleção e relatórios — só as notícias
  // ficam; o MESMO botão traz tudo de volta. Estado lembrado (localStorage); tecla L também alterna.
  {                                                   // Portal, páginas por categoria e tela cheia
    const bt = Object.assign(document.createElement("button"), { className: "op-limpar odin-nao-imprimir" + (telaCheia ? "" : " op-limpar-painel"), type: "button" });
    const aplicarLimpo = (on) => {
      raiz.classList.toggle("op-limpo", on);
      bt.setAttribute("aria-pressed", on);
      bt.innerHTML = on ? "☰ <span>Mostrar recursos</span>" : "◱ <span>Modo limpo</span>";
      bt.title = on ? "Mostrar topo, categorias, seleção e relatórios (L)" : "Ocultar topo, categorias, seleção e relatórios (L)";
    };
    bt.onclick = () => { cfg.limpo = !cfg.limpo; salvarCfg(); aplicarLimpo(cfg.limpo); };
    document.addEventListener("keydown", (e) => {
      if ((e.key === "l" || e.key === "L") && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) bt.click();
    });
    raiz.appendChild(bt);
    aplicarLimpo(!!cfg.limpo);
  }
  const $ = (s) => raiz.querySelector(s);
  const grade = $(".op-grade"), info = $(".op-info");
  $("[data-sort]").value = cfg.sort;
  $("[data-resumo]").value = String(cfg.resumoX);

  // ── filtros ──────────────────────────────────────────────────────────────
  const termosAlerta = () => alertas.map((a) => normalizar(a.termo)).filter(Boolean);
  function filtrar(itens) {
    if (!itens) return null;
    const q = normalizar(busca).trim();
    let r = q ? itens.filter((i) => q.split(/\s+/).every((p) => i._h.includes(p))) : itens.slice();
    const asc = cfg.sort === "data-asc";
    r.sort((a, b) => (asc ? 1 : -1) * ((a.data || "") < (b.data || "") ? -1 : (a.data || "") > (b.data || "") ? 1 : 0));
    return r;
  }
  function ordenarCats(cs) {
    if (cfg.sort === "cat-az") return cs.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (cfg.sort === "cat-za") return cs.sort((a, b) => b.nome.localeCompare(a.nome, "pt-BR"));
    const ordem = ler(chaveOrdem, []);
    const pos = (id) => { const k = ordem.indexOf(id); return k < 0 ? 1e6 : k; };
    return cs.sort((a, b) => pos(a.id) - pos(b.id));
  }
  const realce = (txt) => {
    const q = busca.trim();
    if (!q) return esc(txt);
    let h = esc(txt);
    for (const p of q.split(/\s+/).filter((x) => x.length > 1)) {
      h = h.replace(new RegExp(`(${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
    }
    return h;
  };

  // ── desenho ──────────────────────────────────────────────────────────────
  function desenharAbas() {
    const nav = $(".op-abas");
    // cada categoria é uma PÁGINA própria (/portal/<categoria>), como no portal clássico
    nav.innerHTML = [`<button data-pagina="${pagina("")}" aria-pressed="${!paramCat}">Todas</button>`,
      ...painel.categorias.map((c) => `<button data-pagina="${esc(pagina(c.id))}" aria-pressed="${paramCat === c.id}">${esc(c.emoji)} ${esc(c.nome)}</button>`)].join("");
  }

  let visiveis = [];
  async function desenhar() {
    const t0 = performance.now();
    const at = termosAlerta();
    let cs = categorias();
    cs = ordenarCats(cs);
    visiveis = [];
    const frag = document.createDocumentFragment();
    for (const c of cs) {
      const its = filtrar(c.itens);
      if (busca && its && its.length === 0) continue;          // busca: só sobram categorias com resultado
      const caixa = document.createElement("div");
      caixa.className = "op-caixa"; caixa.dataset.cat = c.id; caixa.setAttribute("role", "listitem");
      const n = its ? its.length : 0;
      const lim = expandidas.has(c.id) ? n : cfg.linhas;
      caixa.innerHTML = `<div class="op-th" draggable="true" title="Arraste para reordenar">
          <span class="op-nome">${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.url)}" style="color:inherit">${esc(c.nome)}</a>` : `${esc(c.emoji)} ${esc(c.nome)}`}</span><span class="op-n">${n}</span>
          <span class="op-mover"><button data-mover="-1" title="Subir">▲</button><button data-mover="1" title="Descer">▼</button></span>
          <button data-alerta-cat title="Extrair alertas desta categoria">🔔</button>
          <label title="Imagem de fundo desta categoria">🖼<input type="file" accept="image/*" data-fundo-cat></label>
          ${c.virtual ? `<button data-del-cat title="Excluir categoria">🗑</button>` : ""}
        </div>` +
        (its === null ? `<div class="op-vazio">Erro ao obter informações</div>` :
          its.slice(0, lim).map((i) => {
            visiveis.push(i.id);
            if (i._alV !== verAlertas) { i._al = at.some((t) => i._h.includes(t)); i._alV = verAlertas; }   // memo: 10 000 termos não pesam na busca
            const al = i._al;
            return `<div class="op-td" data-id="${esc(i.id)}" tabindex="0">
              <input type="checkbox" data-sel ${sel.has(i.id) ? "checked" : ""} aria-label="Selecionar notícia">
              <a href="${esc(i.link)}" target="_blank" rel="noopener" tabindex="-1">${RSS_SVG}</a>
              <div class="op-hrma"><a href="${esc(i.link)}" target="_blank" rel="noopener" class="${al ? "op-alerta-on" : ""}">${al ? "🔔 " : ""}${realce(truncar(i.titulo, cfg.tituloX))}</a></div>
              <span class="op-acoes"><button data-estante title="Guardar na Estante">＋</button><button data-alerta-item title="Criar alerta a partir desta notícia">🔔</button></span>
            </div>`;
          }).join("") +
          (n > cfg.linhas ? `<div class="op-mais"><button data-mais>${expandidas.has(c.id) ? "▲ menos" : `▼ mais ${n - cfg.linhas}`}</button></div>` : ""));
      frag.appendChild(caixa);
      // marca a caixa com fundo; a imagem (IndexedDB) chega de forma assíncrona
      imgUrl("fundo:cat:" + c.id).then((u) => {
        if (!u) return;
        caixa.classList.add("op-com-fundo");
        caixa.style.setProperty("--fundo-cat", `url("${u}")`);
        caixa.style.setProperty("--odin-veu-cat", Math.min(.9, Math.max(.5, tema().veu)));
      });
    }
    grade.replaceChildren(frag);
    // compartilha o recorte atual com Flip e Grafo (notícias filtradas)
    gravar("filtro", { busca, pagina: paramCat || "todas", ids: visiveis.slice(0, 3000), quando: Date.now() });
    $("[data-cont]").textContent = sel.size;
    $("[data-nalertas]").textContent = alertas.length;
    const msDesenho = performance.now() - t0;
    if (!desenhar.primeira) {                                   // ms totais da página (1ª carga), com histórico local
      desenhar.primeira = performance.now() - tInicio;
      const hist = ler("perf", {}); const k = paramCat || "todas";
      hist[k] = [...(hist[k] || []).slice(-19), Math.round(desenhar.primeira)]; gravar("perf", hist);
    }
    const h = ler("perf", {})[paramCat || "todas"] || [];
    const media = h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : 0;
    $("[data-status]").textContent = `⏱ página carregada em ${desenhar.primeira.toFixed(0)} ms (média ${media} ms em ${h.length}) · ${cs.length} ${paramCat ? "feeds" : "categorias"} · ${visiveis.length} notícias · redesenho ${msDesenho.toFixed(1)} ms`;
    raiz.dataset.msPagina = desenhar.primeira.toFixed(0);
  }

  const porId = () => new Map(todos.map((i) => [i.id, i]));

  // ── balão do hover: UM elemento reutilizado (não 3 000 no DOM) ───────────
  let mapa = porId();
  function mostrarInfo(td) {
    const i = mapa.get(td.dataset.id); if (!i) return;
    info.innerHTML = `<div class="op-tit">${esc(i.titulo)}</div>
      <div class="op-desc"><small>${esc(fmtData(i.data))} · ${esc(i.fonte)}</small><br>${esc(truncar(i.resumo, cfg.resumoX))}
      ${i.tags.length ? `<br><small>${i.tags.map((t) => "#" + esc(t)).join(" ")}</small>` : ""}</div>`;
    const r = td.getBoundingClientRect(), rr = raiz.getBoundingClientRect();
    info.hidden = false; info.style.display = "block";
    const larg = Math.min(400, window.innerWidth * 0.82);
    let x = r.left - rr.left + r.width * 0.6;
    if (r.left + r.width * 0.6 + larg > window.innerWidth - 8) x = Math.max(8, r.right - rr.left - larg - r.width * 0.3);
    info.style.left = x + "px"; info.style.top = (r.bottom - rr.top + 2) + "px";
  }
  const esconderInfo = () => { info.hidden = true; info.style.display = "none"; };
  grade.addEventListener("mouseover", (e) => { const td = e.target.closest(".op-td"); td ? mostrarInfo(td) : esconderInfo(); });
  grade.addEventListener("mouseleave", esconderInfo);
  grade.addEventListener("focusin", (e) => { const td = e.target.closest(".op-td"); if (td) mostrarInfo(td); });
  grade.addEventListener("scroll", esconderInfo, { passive: true });

  // ── eventos ──────────────────────────────────────────────────────────────
  $("[data-busca]").addEventListener("input", debounce((e) => { busca = e.target.value; desenhar(); }, 60));
  $("[data-sort]").addEventListener("change", (e) => { cfg.sort = e.target.value; salvarCfg(); desenhar(); });
  $("[data-resumo]").addEventListener("change", (e) => { cfg.resumoX = Number(e.target.value); salvarCfg(); });
  $(".op-abas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pagina]"); if (b) location.href = b.dataset.pagina;
  });

  grade.addEventListener("change", async (e) => {
    if (e.target.matches("[data-sel]")) {
      const id = e.target.closest(".op-td").dataset.id;
      e.target.checked ? sel.add(id) : sel.delete(id);
      gravar("selecao", [...sel]); $("[data-cont]").textContent = sel.size;
    } else if (e.target.matches("[data-fundo-cat]")) {
      const f = e.target.files[0]; if (!f) return;
      const cat = e.target.closest(".op-caixa").dataset.cat;
      await imgGravar("fundo:cat:" + cat, await reduzirImagem(f, 900));
      toast("🖼 Fundo da categoria aplicado — ajuste o véu na barra superior"); desenhar();
    }
  });

  grade.addEventListener("click", (e) => {
    const caixa = e.target.closest(".op-caixa"); if (!caixa) return;
    const cat = caixa.dataset.cat;
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-mais")) { expandidas.has(cat) ? expandidas.delete(cat) : expandidas.add(cat); desenhar(); }
    else if (b.dataset.mover) moverCat(cat, Number(b.dataset.mover));
    else if (b.hasAttribute("data-alerta-cat")) alertaDeCategoria(cat);
    else if (b.hasAttribute("data-del-cat")) { virtuais = virtuais.filter((v) => v.id !== cat); gravar("categoriasVirtuais", virtuais); desenharAbas(); desenhar(); }
    else if (b.hasAttribute("data-estante")) guardar(mapa.get(b.closest(".op-td").dataset.id));
    else if (b.hasAttribute("data-alerta-item")) alertaDeNoticia(mapa.get(b.closest(".op-td").dataset.id));
  });

  // arrastar-e-soltar das caixas de categoria (ordem salva localmente)
  let arrastando = null;
  grade.addEventListener("dragstart", (e) => {
    const caixa = e.target.closest(".op-caixa"); if (!caixa) return;
    arrastando = caixa.dataset.cat; caixa.classList.add("op-arrastando");
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", arrastando);
  });
  grade.addEventListener("dragover", (e) => {
    const alvo = e.target.closest(".op-caixa"); if (!alvo || !arrastando) return;
    e.preventDefault(); grade.querySelectorAll(".op-alvo").forEach((x) => x.classList.remove("op-alvo")); alvo.classList.add("op-alvo");
  });
  grade.addEventListener("drop", (e) => {
    const alvo = e.target.closest(".op-caixa"); if (!alvo || !arrastando) return;
    e.preventDefault();
    const ids = [...grade.querySelectorAll(".op-caixa")].map((x) => x.dataset.cat);
    const de = ids.indexOf(arrastando), para = ids.indexOf(alvo.dataset.cat);
    ids.splice(para, 0, ids.splice(de, 1)[0]);
    salvarOrdem(ids);
  });
  grade.addEventListener("dragend", () => { arrastando = null; grade.querySelectorAll(".op-arrastando,.op-alvo").forEach((x) => x.classList.remove("op-arrastando", "op-alvo")); });

  function salvarOrdem(ids) {
    const antiga = ler(chaveOrdem, []);
    gravar(chaveOrdem, [...ids, ...antiga.filter((x) => !ids.includes(x))]);
    cfg.sort = "pers"; $("[data-sort]").value = "pers"; salvarCfg(); desenhar();
  }
  function moverCat(cat, d) {
    const ids = [...grade.querySelectorAll(".op-caixa")].map((x) => x.dataset.cat);
    const k = ids.indexOf(cat), j = k + d; if (j < 0 || j >= ids.length) return;
    [ids[k], ids[j]] = [ids[j], ids[k]]; salvarOrdem(ids);
  }

  // ── Estante ──────────────────────────────────────────────────────────────
  function guardar(i) {
    if (!i) return;
    const est = ler("estante", []);
    if (est.some((x) => x.id === i.id)) return toast("Já está na Estante");
    est.unshift({ id: i.id, url: i.link, titulo: i.titulo, fonte: i.fonte, resumo: i.resumo, tags: i.tags, coluna: i.coluna,
                  imagem: (painel.itens.find((x) => x.id === i.id) || {}).imagem || "", salvo: new Date().toISOString(),
                  favorito: false, arquivado: false, destaques: [] });
    gravar("estante", est); toast("＋ Guardada na Estante");
  }

  // ── alertas ──────────────────────────────────────────────────────────────
  function addAlerta(termo, origem) {
    termo = termo.trim(); if (!termo) return;
    if (alertas.some((a) => normalizar(a.termo) === normalizar(termo))) return;
    alertas.push({ termo, origem, criado: new Date().toISOString() });
    salvarAlertas();
  }
  function alertaDeNoticia(i) {
    if (!i) return;
    const termos = (i.tags.length ? i.tags.slice(0, 3) : i.titulo.split(/\s+/).filter((w) => w.length > 5).slice(0, 2));
    termos.forEach((t) => addAlerta(t, "notícia: " + truncar(i.titulo, 50)));
    toast(`🔔 Alertas criados: ${termos.join(", ")}`); desenhar();
  }
  function alertaDeCategoria(cat) {
    const c = categorias().find((x) => x.id === cat); if (!c?.itens) return;
    const freq = new Map();
    c.itens.forEach((i) => i.tags.slice(0, 3).forEach((t) => freq.set(t, (freq.get(t) || 0) + 1)));
    const top = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    top.forEach((t) => addAlerta(t, "categoria: " + c.nome));
    toast(`🔔 ${top.length} alertas extraídos de ${c.nome}`); desenhar(); abrirPainelAlertas();
  }
  let ultimoImport = "";
  const contCache = new Map();                       // contagem por termo: memo (invalidada no tempo real)
  const cont = (t) => {
    const n = normalizar(t);
    if (!contCache.has(n)) contCache.set(n, todos.reduce((s, i) => s + (i._h.includes(n) ? 1 : 0), 0));
    return contCache.get(n);
  };
  function abrirPainelAlertas() {
    const pn = $(".op-paineis");
    const MOSTRAR = 300;                               // lista grande (importada) não trava o DOM
    pn.innerHTML = `<div class="op-painel op-painel-alertas"><h4>🔔 Alertas — termos monitorados diariamente</h4>
      <p>Notícias que casam com um alerta aparecem com 🔔 em todas as categorias. Exporte para <code>config/alertas.json</code> e o motor passa a vigiar o termo no Google News / Google Alerts.</p>
      <p><input type="text" placeholder="novo termo…" data-novo-alerta> <button data-add-alerta>Adicionar</button>
         <button data-alerta-busca ${busca ? "" : "disabled"}>Criar a partir da busca atual</button>
         <button data-exp-alertas>⬇ Exportar alertas.json</button> <button data-fechar>Fechar</button></p>
      <div class="op-import" data-soltar tabindex="0">
        <label class="op-btn-import">📂 Importar lista de alertas<input type="file" accept=".xls,.xlsx,.csv,.tsv,.txt,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-import-alertas hidden></label>
        <span>ou arraste o arquivo aqui · <b>.xls</b> · <b>.xlsx</b> · <b>.csv</b> · <b>.txt</b> (uma frase por linha, com ENTER)</span>
        <small>Planilhas: 1ª aba, coluna com cabeçalho <i>Termo</i>/<i>Alerta</i>/<i>Frase</i> ou a 1ª coluna. Linhas vazias, repetidas e começadas por # são ignoradas. Até 10 000 termos por arquivo.</small>
        ${ultimoImport ? `<output>${ultimoImport}</output>` : ""}
      </div>
      <p><b data-nalertas-painel>${alertas.length}</b> termos ${alertas.length ? `<button data-limpar-alertas>🗑 Remover todos</button>` : ""}
         ${alertas.length > 8 ? `<input type="search" placeholder="filtrar a lista…" data-filtro-alertas>` : ""}</p>
      <ul data-lista-alertas>${listaAlertas("", MOSTRAR)}</ul></div>`;
  }
  function listaAlertas(f, max = 300) {
    const q = normalizar(f).trim();
    const lst = alertas.map((a, k) => [a, k]).filter(([a]) => !q || normalizar(a.termo).includes(q));
    return lst.slice(0, max).map(([a, k]) => `<li><b>${esc(a.termo)}</b> — ${cont(a.termo)} notícias hoje <small>(${esc(a.origem || "manual")})</small> <button data-del-alerta="${k}">✕</button></li>`).join("")
      + (lst.length > max ? `<li><small>… e mais ${lst.length - max} — use o filtro acima</small></li>` : "")
      || (alertas.length ? "<li>Nenhum termo casa com o filtro.</li>" : "<li>Nenhum alerta ainda — use 🔔 numa categoria ou numa notícia, ou importe uma lista.</li>");
  }
  async function importarAlertas(arquivo) {
    if (!arquivo) return;
    const t0 = performance.now();
    try {
      const { termosDeArquivo } = await import("./alertas-import.js" + VERSAO);   // carregado só quando usado
      const r = await termosDeArquivo(arquivo);
      const antes = alertas.length, origem = "arquivo: " + truncar(arquivo.name, 40);
      const vistos = new Set(alertas.map((a) => normalizar(a.termo))), quando = new Date().toISOString();
      for (const termo of r.termos) {
        const n = normalizar(termo); if (vistos.has(n)) continue;
        vistos.add(n); alertas.push({ termo, origem, criado: quando });
      }
      salvarAlertas();
      const novos = alertas.length - antes, ja = r.termos.length - novos, ms = Math.round(performance.now() - t0);
      ultimoImport = `✅ <b>${esc(arquivo.name)}</b> (${r.formato}${r.cabecalho ? ", com cabeçalho" : ""}): <b>${novos}</b> novos · ${ja} já existiam · ${r.ignorados} ignorados · ${ms} ms`;
      toast(`🔔 ${novos} alertas importados de ${arquivo.name}`);
    } catch (e) {
      ultimoImport = `❌ <b>${esc(arquivo.name)}</b>: ${esc(e.message || e)}`;
      toast("❌ Não foi possível ler o arquivo de alertas");
    }
    abrirPainelAlertas(); desenhar();
  }
  $(".op-paineis").addEventListener("change", (e) => {
    if (e.target.matches("[data-import-alertas]")) importarAlertas(e.target.files[0]);
  });
  $(".op-paineis").addEventListener("input", debounce((e) => {
    if (e.target.matches("[data-filtro-alertas]")) $("[data-lista-alertas]").innerHTML = listaAlertas(e.target.value);
  }, 120));
  for (const ev of ["dragenter", "dragover"]) $(".op-paineis").addEventListener(ev, (e) => {
    const z = e.target.closest?.("[data-soltar]"); if (!z) return;
    e.preventDefault(); z.classList.add("op-soltando");
  });
  $(".op-paineis").addEventListener("dragleave", (e) => e.target.closest?.("[data-soltar]")?.classList.remove("op-soltando"));
  $(".op-paineis").addEventListener("drop", (e) => {
    const z = e.target.closest?.("[data-soltar]"); if (!z) return;
    e.preventDefault(); z.classList.remove("op-soltando"); importarAlertas(e.dataTransfer.files[0]);
  });
  $(".op-paineis").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-fechar")) { $(".op-paineis").innerHTML = ""; return; }
    if (b.hasAttribute("data-add-alerta")) addAlerta($("[data-novo-alerta]").value, "manual");
    if (b.hasAttribute("data-alerta-busca")) addAlerta(busca, "busca");
    if (b.dataset.delAlerta !== undefined) { alertas.splice(Number(b.dataset.delAlerta), 1); salvarAlertas(); }
    if (b.hasAttribute("data-limpar-alertas")) {
      if (!confirm(`Remover os ${alertas.length} termos de alerta?`)) return;
      alertas = []; salvarAlertas(); ultimoImport = ""; abrirPainelAlertas(); desenhar(); return;
    }
    if (b.hasAttribute("data-exp-alertas")) {
      baixar("alertas.json", JSON.stringify({ topicos: alertas.map((a) => ({ nome: a.termo, consulta: `"${a.termo}"`, idioma: "pt-BR", feed_google_alerts: "", filtro_excluir: [] })) }, null, 2));
    }
    if (b.hasAttribute("data-criar-cat")) {
      const nome = $("[data-cat-nome]").value.trim(), termos = $("[data-cat-termos]").value.split(",").map((s) => s.trim()).filter(Boolean);
      if (!nome || !termos.length) return toast("Informe nome e ao menos um termo");
      virtuais.push({ id: "u-" + Date.now().toString(36), nome, termos }); gravar("categoriasVirtuais", virtuais);
      $(".op-paineis").innerHTML = ""; desenharAbas(); desenhar(); return;
    }
    if (b.hasAttribute("data-add-alerta") || b.hasAttribute("data-alerta-busca") || b.dataset.delAlerta !== undefined) { abrirPainelAlertas(); desenhar(); }
  });

  // ── barra de seleção: PDF, Jornal exclusivo, Flip, Grafo ─────────────────
  const selecionados = () => { mapa = porId(); return [...sel].map((id) => mapa.get(id)).filter(Boolean); };
  $(".op-sel").addEventListener("click", (e) => {
    const b = e.target.closest("[data-acao]"); if (!b) return;
    const a = b.dataset.acao;
    if (a === "vis") { visiveis.forEach((id) => sel.add(id)); gravar("selecao", [...sel]); desenhar(); }
    if (a === "limpar") { sel.clear(); gravar("selecao", []); desenhar(); }
    if (a === "alertas") abrirPainelAlertas();
    if (a === "monitor") (document.fullscreenElement ? document.exitFullscreen() : raiz.requestFullscreen?.({ navigationUI: "hide" }))?.catch?.(() => {});
    if (a === "novacat") {
      $(".op-paineis").innerHTML = `<div class="op-painel"><h4>＋ Nova categoria (ilimitadas)</h4>
        <p>Uma categoria virtual reúne notícias de TODAS as fontes que contenham qualquer um dos termos.</p>
        <p><input type="text" placeholder="Nome" data-cat-nome> <input type="text" placeholder="termos separados por vírgula" size="40" data-cat-termos>
        <button data-criar-cat>Criar</button> <button data-fechar>Cancelar</button></p></div>`;
    }
    if (a === "flip") location.href = rota("/flip");
    if (a === "grafo") location.href = rota("/grafo");
    if (a === "pdf" || a === "jornal") {
      const its = selecionados();
      if (!its.length) return toast("Selecione notícias (☑) ou use “Selecionar visíveis”");
      const grupos = new Map();
      for (const i of its) { if (!grupos.has(i.coluna)) grupos.set(i.coluna, []); grupos.get(i.coluna).push(i); }
      const cats = categorias();
      const nome = (id) => cats.find((c) => c.id === id) || { nome: id, emoji: "" };
      if (a === "pdf") {
        const corpo = `<div style="font:13px/1.45 Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px">
          <h1 style="font-size:20px;border-bottom:2px solid #49a5d3">ODIN — Relatório de notícias selecionadas</h1>
          <p style="color:#555">${esc(new Date().toLocaleString("pt-BR"))} · ${its.length} notícias · ${grupos.size} categorias${busca ? ` · filtro: “${esc(busca)}”` : ""}</p>
          ${[...grupos].map(([cid, lst]) => `<h2 style="font-size:15px;color:#004080;margin-top:18px">${esc(nome(cid).emoji)} ${esc(nome(cid).nome)}</h2>
            <ol>${lst.map((i) => `<li style="margin:6px 0"><b><a href="${esc(i.link)}">${esc(i.titulo)}</a></b><br>
              <small style="color:#555">${esc(i.fonte)} · ${esc(fmtData(i.data))}</small><br>${esc(truncar(i.resumo, 400))}</li>`).join("")}</ol>`).join("")}
          <p style="margin-top:24px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:6px">ProfBru - Bruno Penedo © 2026 — TODOS OS DIREITOS RESERVADOS</p></div>`;
        abrirDocumento("ODIN — Relatório", corpo, "a{color:#004080}");
      } else {
        const colunas = [...grupos].map(([cid, lst]) => ({ id: cid, nome: nome(cid).nome, emoji: nome(cid).emoji,
          manchetes: lst.map((i) => ({ ...i, nFontes: 1 })) }));
        const top = its[0];
        const html = jornalHTML({ titulo: "O Diário ODIN", subtitulo: `Edição exclusiva sob medida — ${its.length} notícias escolhidas por você`,
          dia: painel.dia, exclusivo: true, colunas, manchete: { titulo: top.titulo, link: top.link, fonte: top.fonte, resumo: truncar(top.resumo, 500), n_fontes: 1 } });
        gravar("jornalExclusivo", { quando: Date.now(), ids: its.map((i) => i.id) });
        const w = abrirDocumento("O Diário ODIN — Edição exclusiva", html, JORNAL_CSS, false);
        if (w) toast("📰 Jornal exclusivo gerado — use Ctrl+P para PDF");
      }
    }
  });

  // ── tempo real: itens novos do motor Elixir entram sem recarregar ────────
  tempoReal((novos) => {
    let n = 0;
    for (const x of novos) {
      const lst = porCat.get(x.coluna); if (!lst || lst.some((i) => i.id === x.id)) continue;
      const it = indexar({ id: x.id, titulo: x.titulo, link: x.link, resumo: x.resumo, data: x.publicado, fonte: x.fonte, feed: x.feed, tags: [], coluna: x.coluna });
      lst.unshift(it); todos.push(it); n++;
    }
    if (n) { contCache.clear(); mapa = porId(); desenhar(); toast(`⚡ ${n} notícias novas em tempo real`); }
  });

  desenharAbas();
  await desenhar();
}
