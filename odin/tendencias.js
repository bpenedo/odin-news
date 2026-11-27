// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Tendências: painel de feeds RSS em colunas, no formato "nova aba" dos leitores de extensão.
// Uma coluna por feed, rolagem lateral, filtro por data de publicação, atualizar, modo escuro e
// gerenciador de feeds (adicionar, remover, reordenar). Alimentado pela MESMA base do Portal:
//   • /odin/feeds/<coluna>.xml          → as colunas do Jornal (padrão)
//   • /odin/feeds/<coluna>.txt          → índice dos feeds catalogados (nome | espelho local | URL original)
// Feeds de fora do catálogo também podem ser adicionados por URL (lidos direto pelo navegador, se o site permitir).
// Cada notícia tem, no rodapé à esquerda: ♥ Curtir · ↗ Compartilhar (folha nativa do sistema no celular,
// link copiado no computador) · 🔖 Salvar na Estante (o "Pocket" local do ODIN).
// Arrastar e soltar as COLUNAS para reordenar (mouse pelo cabeçalho; dedo pela alça ⋮⋮; teclado: setas na alça).
// Estado 100 % local (localStorage odin:tendencias, odin:tendencias-curtidas, odin:estante).

const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
const { carregarCss, carregarPainel, esc, gravar, ler, rota, toast } = await import("./comum.js" + VERSAO);
const { idDeUrl } = await import("./estante-import.js" + VERSAO);

const CHAVE = "tendencias";
const POR_VEZ = 40;                                  // itens desenhados por coluna antes do "Mostrar mais"
const FILTROS = [["none", "Sem filtro"], ["today", "Só hoje"], ["last_2_days", "Hoje e ontem"], ["last_7_days", "Últimos 7 dias"]];
const RSS_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2.2" fill="currentColor"/><path d="M3.8 10.6a9.6 9.6 0 0 1 9.6 9.6h-2.9a6.7 6.7 0 0 0-6.7-6.7zM3.8 3.8A16.4 16.4 0 0 1 20.2 20.2h-2.9A13.5 13.5 0 0 0 3.8 6.7z" fill="currentColor"/></svg>`;
const ICONE = {
  curtir: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a4.7 4.7 0 0 1 6.6-6.7l.8.8.8-.8a4.7 4.7 0 0 1 6.6 6.7z"/></svg>`,
  compartilhar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v7h14v-7"/></svg>`,
  salvar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>`,
};
const CURTIDAS = "tendencias-curtidas";
const ALCA_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>`;
const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const espaco = (s) => String(s || "").replace(/\s+/g, " ").trim();
const semHtml = (() => { const p = new DOMParser(); return (s) => espaco(/[<&]/.test(s || "") ? p.parseFromString(s, "text/html").body.textContent : s); })();

// ── leitura e filtro (puros: exportados para teste) ─────────────────────────
export function lerFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML inválido");
  const aviso = doc.getElementsByTagName("odin:erro")[0]?.textContent || "";
  const nos = [...doc.getElementsByTagName("item"), ...doc.getElementsByTagName("entry")];
  const txt = (n, nomes) => { for (const k of nomes) { const e = n.getElementsByTagName(k)[0]; if (e?.textContent) return e.textContent; } return ""; };
  const itens = nos.map((n) => {
    let link = txt(n, ["link"]);
    if (!link) { const l = [...n.getElementsByTagName("link")].find((e) => !e.getAttribute("rel") || e.getAttribute("rel") === "alternate"); link = l?.getAttribute("href") || ""; }
    const d = new Date(espaco(txt(n, ["pubDate", "published", "updated", "dc:date"])));
    return { titulo: espaco(txt(n, ["title"])) || "Sem título", link: espaco(link), resumo: semHtml(txt(n, ["description", "summary", "content", "content:encoded"])),
             data: isNaN(d) ? null : d.getTime() };
  });
  itens.sort((a, b) => (b.data || 0) - (a.data || 0));
  return { titulo: espaco(doc.querySelector("channel > title, feed > title")?.textContent || ""), itens, aviso };
}

export function inicioDoFiltro(filtro, agora = new Date()) {
  const dias = { today: 0, last_2_days: 1, last_7_days: 7 }[filtro];
  if (dias === undefined) return null;
  const d = new Date(agora); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - dias);
  return d.getTime();
}
export const filtrar = (itens, filtro, agora) => {
  const ini = inicioDoFiltro(filtro, agora);
  return ini === null ? itens : itens.filter((i) => i.data !== null && i.data >= ini);
};

// ── catálogo: colunas do Jornal + feeds de cada coluna (mesma base do Portal) ─
async function catalogo(forcar = false) {
  const painel = await carregarPainel(forcar);
  const colunas = painel.categorias.map((c) => ({ id: "col:" + c.id, titulo: `${c.emoji} ${c.nome}`, url: rota(`/odin/feeds/${c.id}.xml`),
    link: rota(`/odin/feeds/${c.id}.xml`), grupo: "Colunas do Jornal" }));
  const feeds = (await Promise.all(painel.categorias.map(async (c) => {
    try {
      const r = await fetch(rota(`/odin/feeds/${c.id}.txt`), { cache: "no-store" });
      if (!r.ok) return [];
      return (await r.text()).split("\n").map((l) => l.trim()).filter((l) => l && l[0] !== "#").map((l) => {
        const [nome, arquivo, original] = l.split(" | ").map((s) => (s || "").trim());
        return arquivo ? { id: "feed:" + arquivo, titulo: nome || arquivo, url: rota(arquivo), link: original || rota(arquivo), grupo: `${c.emoji} ${c.nome}` } : null;
      }).filter(Boolean);
    } catch { return []; }
  }))).flat();
  return { colunas, feeds, todos: [...colunas, ...feeds], dia: painel.dia };
}

export async function montar(raiz) {
  carregarCss("/odin/tendencias.css");
  raiz.classList.add("odin-app", "td-raiz");
  document.documentElement.classList.add("td-sem-rolagem");
  // ao sair da página (navegação do painel), devolve a rolagem do documento
  const vigia = new MutationObserver(() => { if (!raiz.isConnected) { document.documentElement.classList.remove("td-sem-rolagem"); vigia.disconnect(); } });
  vigia.observe(document.body, { childList: true, subtree: true });

  const est = { feeds: null, proprios: [], filtro: "none", tema: "claro", layout: "empilhadas", ...ler(CHAVE, {}) };
  const salvar = () => gravar(CHAVE, { feeds: est.feeds, proprios: est.proprios, filtro: est.filtro, tema: est.tema, layout: est.layout });
  // ♥ e 🔖: conjuntos em memória (a Estante pode ter milhares de itens: lida uma vez, não a cada notícia)
  let curtidas = new Set(ler(CURTIDAS, [])), naEstante = null;
  const estante = () => (naEstante ||= new Set(ler("estante", []).flatMap((x) => [x.id, x.url].filter(Boolean))));
  const salva = (i) => estante().has(i.link) || estante().has(idDeUrl(i.link));
  // celular: "empilhadas" (uma coluna embaixo da outra) ou "lado a lado" (desliza de lado); no computador, sempre lado a lado
  const layout = (l) => { est.layout = l === "lado" ? "lado" : "empilhadas"; raiz.dataset.layout = est.layout; const s = raiz.querySelector("[data-disposicao]"); if (s) s.value = est.layout; };
  layout(est.layout);
  const tema = (t) => { est.tema = t; raiz.dataset.tema = t; const c = raiz.querySelector("[data-tema-chave]"); if (c) c.checked = t === "escuro"; };
  tema(est.tema);

  raiz.innerHTML = `
    <div class="td-casca">
      <header class="td-topo">
        <div class="td-titulo">
          <h1><img src="${rota("/odin/odin-olho.png")}" alt="" width="40" height="40"> Tendências</h1>
          <p><span class="td-desc">Painel de feeds focado: as colunas e os feeds catalogados no Portal, lado a lado. </span><a href="${rota("/portal")}">← Voltar ao ODIN</a></p>
        </div>
        <button class="td-menu" type="button" aria-expanded="false" aria-controls="td-meta" aria-label="Mostrar controles" data-menu>
          <span class="td-menu-ic" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
        <div class="td-meta" id="td-meta">
          <label class="td-chip td-chip-sel" data-chip-filtro>
            <span class="td-rotulo">Publicado</span>
            <span class="td-sel"><select data-filtro aria-label="Filtrar por data de publicação">${FILTROS.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select><span class="td-seta" aria-hidden="true"></span></span>
          </label>
          <label class="td-chip td-chip-sel td-chip-layout">
            <span class="td-rotulo">Colunas</span>
            <span class="td-sel"><select data-disposicao aria-label="Disposição das colunas no celular"><option value="empilhadas">Empilhadas</option><option value="lado">Lado a lado</option></select><span class="td-seta" aria-hidden="true"></span></span>
          </label>
          <div class="td-chip td-chip-status" data-status>
            <div class="td-chip-copia"><span class="td-rotulo">Atualizado</span><strong data-hora>--:--</strong></div>
            <button class="td-botao" type="button" data-atualizar>Atualizar</button>
          </div>
          <button class="td-chip td-chip-feeds" type="button" data-gerenciar><span class="td-chip-copia"><span class="td-rotulo">Feeds</span><strong>Gerenciar</strong></span></button>
          <label class="td-chip td-chip-tema">
            <span class="td-rotulo">Modo escuro</span>
            <span class="td-chave"><input type="checkbox" data-tema-chave aria-label="Modo escuro"><span class="td-trilho" aria-hidden="true"><span class="td-bola"></span></span></span>
          </label>
        </div>
      </header>
      <main class="td-painel">
        <div class="td-painel-cab"><p class="td-nota" data-contagem>0 feeds salvos</p></div>
        <div class="td-grade" data-grade></div>
      </main>
    </div>
    <div class="td-ger" data-ger hidden role="dialog" aria-modal="true" aria-labelledby="td-ger-t"></div>`;
  const $ = (s) => raiz.querySelector(s);
  const grade = $("[data-grade]"), meta = $(".td-meta"), menu = $("[data-menu]"), status = $("[data-status]");
  tema(est.tema); layout(est.layout);
  $("[data-filtro]").value = est.filtro;

  let cat = await catalogo().catch(() => ({ colunas: [], feeds: [], todos: [], dia: "" }));
  const proprio = (p) => ({ id: "url:" + p.url, titulo: p.titulo || hostDe(p.url), url: p.url, link: p.url, grupo: "Meus feeds", externo: true });
  const porId = () => new Map([...cat.todos, ...est.proprios.map(proprio)].map((f) => [f.id, f]));
  if (!Array.isArray(est.feeds)) est.feeds = cat.colunas.map((c) => c.id);      // padrão: as colunas do Jornal
  const salvos = () => { const m = porId(); return est.feeds.map((id) => m.get(id)).filter(Boolean); };

  // ── busca dos feeds: uma promessa por URL, renovada no "Atualizar" ──────────
  let memo = new Map(), geracao = 0;
  const buscar = (f) => {
    if (!memo.has(f.url)) memo.set(f.url, fetch(f.url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }).then(lerFeed).catch((e) => { throw f.externo && e instanceof TypeError ? new Error("o site deste feed não permite leitura direta pelo navegador (CORS)") : e; }));
    return memo.get(f.url);
  };

  function situacao(msg, tom) {
    $("[data-hora]").textContent = fmtHora.format(new Date());
    status.dataset.tom = tom; status.title = msg;
  }

  function cartao(f) {
    const s = document.createElement("section");
    s.className = "td-cartao"; s.dataset.estado = "carregando"; s.dataset.feed = f.id;
    s.innerHTML = `<div class="td-cartao-cab"><button class="td-arrastar" type="button" data-arrastar aria-label="Mover a coluna ${esc(f.titulo)}: arraste, ou use as setas do teclado" title="Arraste para reordenar a coluna">${ALCA_SVG}</button><h3 title="${esc(f.titulo)}">${esc(f.titulo)}</h3>
      <span class="td-qtd" data-qtd hidden></span><a class="td-rss" href="${esc(f.link)}" target="_blank" rel="noreferrer" aria-label="Abrir o feed ${esc(f.titulo)}" title="${esc(f.link)}">${RSS_SVG}</a></div>
      <div class="td-corpo"><div class="td-itens"><div class="td-carregando"><p>Carregando o feed…</p><div class="td-trilha"><div class="td-barra"></div></div></div></div>
      <div class="td-rolo" aria-hidden="true"><div class="td-polegar"></div></div></div>`;
    rolagem(s);
    return s;
  }

  // ── barra de rolagem PRÓPRIA de cada coluna: sempre visível e arrastável (o iOS esconde a nativa) ──
  function rolagem(no) {
    const cx = no.querySelector(".td-itens"), trilho = no.querySelector(".td-rolo"), pol = no.querySelector(".td-polegar");
    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const vis = cx.clientHeight, tot = cx.scrollHeight, sobra = tot - vis;
      trilho.hidden = sobra <= 1;
      const th = trilho.clientHeight;                    // medido DEPOIS de revelar (oculto mede 0)
      if (sobra <= 1 || !th) return;
      const h = Math.max(36, Math.round((vis / tot) * th));
      pol.style.height = h + "px";
      pol.style.transform = `translateY(${Math.round((cx.scrollTop / sobra) * (th - h))}px)`;
    };
    const agendar = () => { if (!pedido) pedido = requestAnimationFrame(medir); };
    cx.addEventListener("scroll", agendar, { passive: true });
    new ResizeObserver(agendar).observe(cx);
    new MutationObserver(agendar).observe(cx, { childList: true });
    // arrastar o polegar (dedo ou mouse) → rola só esta coluna
    pol.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const y0 = e.clientY, s0 = cx.scrollTop;
      const fator = (cx.scrollHeight - cx.clientHeight) / Math.max(1, trilho.clientHeight - pol.offsetHeight);
      pol.setPointerCapture(e.pointerId); no.classList.add("td-rolando");
      const mover = (ev) => { cx.scrollTop = s0 + (ev.clientY - y0) * fator; };
      const soltar = () => { pol.removeEventListener("pointermove", mover); no.classList.remove("td-rolando"); };
      pol.addEventListener("pointermove", mover);
      pol.addEventListener("pointerup", soltar, { once: true }); pol.addEventListener("pointercancel", soltar, { once: true });
    });
    // tocar no trilho → salta uma "página" naquela direção
    trilho.addEventListener("pointerdown", (e) => {
      if (e.target !== trilho) return;
      const r = pol.getBoundingClientRect();
      cx.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * cx.clientHeight * 0.9, behavior: "smooth" });
    });
  }

  function preencher(no, dados) {
    const caixa = no.querySelector(".td-itens");
    no.dataset.estado = "pronto";
    const itens = filtrar(dados.itens, est.filtro);
    const qtd = no.querySelector("[data-qtd]"); qtd.hidden = false; qtd.textContent = itens.length.toLocaleString("pt-BR"); qtd.title = `${qtd.textContent} entradas no filtro atual`;
    if (!itens.length) {
      caixa.innerHTML = `<div class="td-vazio">${dados.itens.length ? "Nenhuma entrada no filtro atual." : esc(dados.aviso ? `Sem entradas: ${dados.aviso}.` : "Este feed não trouxe entradas.")}</div>`;
      return;
    }
    let n = 0;
    const lote = () => {
      caixa.querySelector(".td-mais")?.remove();
      caixa.insertAdjacentHTML("beforeend", itens.slice(n, n + POR_VEZ).map((i, k) => `<article class="td-item" data-i="${n + k}">
        <a class="td-link" href="${esc(i.link)}" target="_blank" rel="noreferrer"><strong>${esc(i.titulo)}</strong>${i.resumo ? `<span>${esc(i.resumo.slice(0, 400))}</span>` : ""}</a>
        <footer class="td-rodape">${acoes(i)}${i.data ? `<time datetime="${new Date(i.data).toISOString()}">${fmtData.format(i.data)}</time>` : ""}</footer></article>`).join(""));
      n += POR_VEZ;
      if (n < itens.length) caixa.insertAdjacentHTML("beforeend", `<button class="td-botao td-mais" type="button">Mostrar mais (${(itens.length - n).toLocaleString("pt-BR")})</button>`);
    };
    caixa.innerHTML = ""; lote();
    const fonte = no.querySelector("h3")?.textContent || "";
    caixa.onclick = (e) => {
      if (e.target.closest(".td-mais")) return lote();
      const b = e.target.closest("[data-acao]"); if (!b) return;
      const i = itens[Number(b.closest(".td-item").dataset.i)]; if (!i) return;
      ({ curtir, compartilhar, salvar: salvarEstante })[b.dataset.acao]?.(i, b, fonte);
    };
  }

  // ── ações de cada notícia: ♥ curtir · ↗ compartilhar · 🔖 salvar na Estante ──
  function acoes(i) {
    const c = curtidas.has(i.link), s = salva(i);
    return `<div class="td-acoes">
      <button type="button" data-acao="curtir" aria-pressed="${c}" aria-label="${c ? "Descurtir" : "Curtir"}" title="${c ? "Curtida — toque para desfazer" : "Curtir"}">${ICONE.curtir}</button>
      <button type="button" data-acao="compartilhar" aria-label="Compartilhar" title="Compartilhar">${ICONE.compartilhar}</button>
      <button type="button" data-acao="salvar" aria-pressed="${s}" aria-label="${s ? "Remover da Estante" : "Salvar na Estante"}" title="${s ? "Na Estante — toque para remover" : "Salvar na Estante (leitura local)"}">${ICONE.salvar}</button></div>`;
  }
  const pop = (b) => { b.classList.remove("td-pop"); void b.offsetWidth; b.classList.add("td-pop"); };
  // a mesma notícia pode estar em mais de uma coluna (coluna do Jornal + feed avulso): atualiza todas
  const marcarTodas = (acao, link, on, rotulos) => raiz.querySelectorAll(`.td-item [data-acao="${acao}"]`).forEach((b) => {
    const a = b.closest(".td-item").querySelector(".td-link");
    if (a?.getAttribute("href") !== link) return;
    b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", rotulos[0]); b.title = rotulos[1];
  });
  function curtir(i, b) {
    const on = !curtidas.has(i.link);
    on ? curtidas.add(i.link) : curtidas.delete(i.link);
    gravar(CURTIDAS, [...curtidas].slice(-5000));
    marcarTodas("curtir", i.link, on, on ? ["Descurtir", "Curtida — toque para desfazer"] : ["Curtir", "Curtir"]);
    pop(b);
  }
  async function compartilhar(i) {
    const dados = { title: i.titulo, text: `${i.titulo} — via ODIN`, url: i.link };
    try {
      if (navigator.share) return await navigator.share(dados);
      await navigator.clipboard.writeText(`${i.titulo}\n${i.link}`);
      toast("🔗 Link copiado — cole onde quiser compartilhar");
    } catch (err) {
      if (err?.name !== "AbortError") prompt("Copie o link para compartilhar:", i.link);
    }
  }
  function salvarEstante(i, b, fonte) {
    let lista = ler("estante", []);
    const id = idDeUrl(i.link), ja = lista.some((x) => x.id === id || x.url === i.link);
    if (ja) lista = lista.filter((x) => x.id !== id && x.url !== i.link);
    else lista.unshift({ id, url: i.link, titulo: i.titulo, fonte, resumo: (i.resumo || "").slice(0, 600), tags: ["tendencias"],
      salvo: new Date().toISOString(), favorito: false, arquivado: false, destaques: [] });
    if (!gravar("estante", lista)) return;
    naEstante = null;
    toast(ja ? "Removida da Estante" : "🔖 Salva na Estante");
    marcarTodas("salvar", i.link, !ja, ja ? ["Salvar na Estante", "Salvar na Estante (leitura local)"] : ["Remover da Estante", "Na Estante — toque para remover"]);
    pop(b);
  }

  function falhar(no, erro) {
    no.dataset.estado = "erro";
    no.querySelector(".td-itens").innerHTML = `<div class="td-erro">Não foi possível carregar este feed${erro?.message ? `: ${esc(erro.message)}` : ""}.</div>`;
  }

  async function painel() {
    const g = ++geracao;
    const lista = salvos();
    $("[data-contagem]").textContent = `${lista.length} ${lista.length === 1 ? "feed salvo" : "feeds salvos"}`;
    grade.classList.toggle("td-vazia", !lista.length);
    if (!lista.length) {
      grade.innerHTML = `<section class="td-boas-vindas"><h3>Nenhum feed ainda</h3><p>Abra <b>Feeds → Gerenciar</b> e escolha colunas do Jornal ou feeds do catálogo do Portal, ou cole a URL de um feed RSS ou Atom.</p>
        <button class="td-botao" type="button" data-gerenciar>Gerenciar feeds</button></section>`;
      situacao("Atualizado", "ok");
      return;
    }
    situacao("Buscando os feeds", "carregando");
    const nos = lista.map(cartao);
    grade.replaceChildren(...nos);
    let falhas = 0;
    await Promise.all(lista.map((f, k) => buscar(f).then((d) => { if (g === geracao) preencher(nos[k], d); },
      (e) => { falhas++; if (g === geracao) falhar(nos[k], e); })));
    if (g !== geracao) return;
    situacao(falhas ? `${falhas} ${falhas === 1 ? "feed falhou" : "feeds falharam"} ao carregar` : "Atualizado", falhas ? "aviso" : "ok");
  }

  // ── gerenciador de feeds ────────────────────────────────────────────────────
  const ger = $("[data-ger]");
  let buscaGer = "";
  function desenharGer() {
    const lista = salvos(), ja = new Set(est.feeds);
    const q = buscaGer.toLowerCase();
    const opcoes = [...cat.todos, ...est.proprios.map(proprio)].filter((f) => !q || `${f.titulo} ${f.grupo} ${f.link}`.toLowerCase().includes(q));
    let grupo = "";
    ger.innerHTML = `<div class="td-ger-caixa">
      <div class="td-ger-cab"><h2 id="td-ger-t">Gerenciar feeds</h2><button class="td-botao" type="button" data-fechar>Concluir</button></div>
      <div class="td-ger-corpo">
        <div class="td-ger-col"><h3>Seus feeds (${lista.length}) · arraste para reordenar</h3>
          <ul class="td-ger-lista" data-salvos>${lista.map((f, k) => `<li data-id="${esc(f.id)}"><span class="td-alca" aria-hidden="true" title="Arrastar">⋮⋮</span>
            <span title="${esc(f.titulo)}">${esc(f.titulo)}<br><small>${esc(f.grupo)}</small></span>
            <button type="button" data-sobe ${k ? "" : "disabled"} aria-label="Subir ${esc(f.titulo)}">↑</button>
            <button type="button" data-desce ${k < lista.length - 1 ? "" : "disabled"} aria-label="Descer ${esc(f.titulo)}">↓</button>
            <button type="button" data-tira aria-label="Remover ${esc(f.titulo)}">✕</button></li>`).join("") || `<li><span>Nenhum feed. Adicione ao lado.</span></li>`}</ul></div>
        <div class="td-ger-col"><h3>Adicionar</h3>
          <input type="search" placeholder="Buscar no catálogo do Portal" value="${esc(buscaGer)}" data-busca-ger aria-label="Buscar no catálogo">
          <ul class="td-ger-lista" data-catalogo>${opcoes.map((f) => {
            const cab = f.grupo !== grupo ? `<li class="td-ger-grupo">${esc((grupo = f.grupo))}</li>` : "";
            return cab + `<li data-id="${esc(f.id)}"><span title="${esc(f.link)}">${esc(f.titulo)}</span>
              <button type="button" data-poe ${ja.has(f.id) ? "disabled" : ""} aria-label="${ja.has(f.id) ? "Já adicionado" : "Adicionar " + esc(f.titulo)}">${ja.has(f.id) ? "✓" : "＋"}</button></li>`;
          }).join("") || `<li><span>Nada encontrado.</span></li>`}</ul>
          <form class="td-ger-url" data-form-url><input type="url" required placeholder="https://site.com/feed.xml" aria-label="URL de um feed RSS ou Atom"><button class="td-botao" type="submit">＋ URL</button></form>
        </div>
      </div>
      <div class="td-ger-rodape"><button class="td-botao" type="button" data-padrao>Restaurar padrão</button>
        <small>${cat.colunas.length} colunas e ${cat.feeds.length} feeds no catálogo${cat.dia ? ` · base de ${esc(cat.dia.split("-").reverse().join("/"))}` : ""}</small></div>
    </div>`;
  }
  const abrirGer = () => { buscaGer = ""; desenharGer(); ger.hidden = false; ger.querySelector("[data-busca-ger]")?.focus(); fecharMenu(); };
  const fecharGer = () => { ger.hidden = true; };
  const mudou = () => { salvar(); desenharGer(); painel(); };

  ger.addEventListener("click", (e) => {
    if (e.target === ger) return fecharGer();
    const b = e.target.closest("button"); if (!b) return;
    const id = b.closest("li")?.dataset.id, k = est.feeds.indexOf(id);
    if (b.hasAttribute("data-fechar")) return fecharGer();
    if (b.hasAttribute("data-padrao")) { est.feeds = cat.colunas.map((c) => c.id); return mudou(); }
    if (b.hasAttribute("data-poe") && id && k < 0) { est.feeds.push(id); return mudou(); }
    if (b.hasAttribute("data-tira") && k >= 0) { est.feeds.splice(k, 1); if (id.startsWith("url:")) est.proprios = est.proprios.filter((p) => "url:" + p.url !== id); return mudou(); }
    if ((b.hasAttribute("data-sobe") || b.hasAttribute("data-desce")) && k >= 0) {
      const j = k + (b.hasAttribute("data-sobe") ? -1 : 1);
      if (j < 0 || j >= est.feeds.length) return;
      [est.feeds[k], est.feeds[j]] = [est.feeds[j], est.feeds[k]]; mudou();
      ger.querySelector(`[data-salvos] li[data-id="${CSS.escape(id)}"] [data-${j < k ? "sobe" : "desce"}]`)?.focus();
    }
  });
  ger.addEventListener("input", (e) => {
    if (!e.target.matches("[data-busca-ger]")) return;
    buscaGer = e.target.value; const pos = e.target.selectionStart;
    desenharGer(); const i = ger.querySelector("[data-busca-ger]"); i.focus(); i.setSelectionRange(pos, pos);
  });
  ger.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = espaco(e.target.querySelector("input").value);
    if (!/^https?:\/\//i.test(url)) return;
    if (!est.proprios.some((p) => p.url === url)) est.proprios.push({ url, titulo: hostDe(url) });
    if (!est.feeds.includes("url:" + url)) est.feeds.push("url:" + url);
    mudou();
  });
  // arrastar para reordenar (mouse e toque): ponteiro na alça ⋮⋮
  ger.addEventListener("pointerdown", (e) => {
    const alca = e.target.closest(".td-alca"); if (!alca) return;
    const li = alca.closest("li"), ul = li.parentElement;
    e.preventDefault(); li.classList.add("td-arrastando");
    const mover = (ev) => {
      const alvo = [...ul.children].find((o) => { const r = o.getBoundingClientRect(); return ev.clientY >= r.top && ev.clientY <= r.bottom; });
      if (alvo && alvo !== li) { const r = alvo.getBoundingClientRect(); ul.insertBefore(li, ev.clientY < r.top + r.height / 2 ? alvo : alvo.nextSibling); }
    };
    const soltar = () => {
      document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", soltar); document.removeEventListener("pointercancel", soltar);
      li.classList.remove("td-arrastando");
      est.feeds = [...ul.querySelectorAll("li[data-id]")].map((o) => o.dataset.id); mudou();
    };
    document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar); document.addEventListener("pointercancel", soltar);
  });

  // ── arrastar e soltar as colunas no painel ──────────────────────────────────
  // Mouse: arrasta pelo cabeçalho inteiro. Toque (Android/iOS): só pela alça ⋮⋮, para não brigar com a rolagem.
  // A coluna acompanha o ponteiro; ao passar do meio de outra, troca de lugar; perto da borda o painel rola sozinho.
  // A nova ordem vai para est.feeds sem recarregar os feeds (o DOM já está na ordem certa).
  const vertical = () => getComputedStyle(grade).display === "flex";        // celular "empilhadas"
  const gravarOrdem = () => {
    const ordem = [...grade.querySelectorAll(".td-cartao")].map((c) => c.dataset.feed);
    est.feeds = [...ordem, ...est.feeds.filter((id) => !ordem.includes(id))];
    salvar();
  };
  grade.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const cab = e.target.closest(".td-cartao-cab"), alca = e.target.closest("[data-arrastar]");
    if (!cab || (!alca && (e.pointerType !== "mouse" || e.target.closest("a, button")))) return;
    const card = cab.closest(".td-cartao");
    e.preventDefault();
    const vert = vertical(), p0 = { x: e.clientX, y: e.clientY }, r0 = card.getBoundingClientRect();
    const pega = { x: p0.x - r0.left, y: p0.y - r0.top };               // onde o ponteiro "segura" a coluna
    let t = { x: 0, y: 0 }, ultimo = p0, movido = false, quadro = 0;
    // posição = ponteiro − pega − lugar natural da coluna (medido agora): imune a rolagem e a trocas no DOM
    const posicionar = () => {
      const r = card.getBoundingClientRect();
      t = { x: ultimo.x - pega.x - (r.left - t.x), y: ultimo.y - pega.y - (r.top - t.y) };
      card.style.transform = `translate(${t.x}px, ${t.y}px)`;
    };
    const trocar = () => {
      card.style.pointerEvents = "none";
      const alvo = document.elementFromPoint(ultimo.x, ultimo.y)?.closest(".td-cartao");
      card.style.pointerEvents = "";
      if (!alvo || alvo === card || alvo.parentElement !== grade) return;
      const r = alvo.getBoundingClientRect(), antes = vert ? ultimo.y < r.top + r.height / 2 : ultimo.x < r.left + r.width / 2;
      const ref = antes ? alvo : alvo.nextElementSibling;
      if (ref === card || card.nextElementSibling === ref) return;
      grade.insertBefore(card, ref);
      posicionar();
    };
    const rolarBorda = () => {            // auto-rolagem perto das bordas do painel
      const g = grade.getBoundingClientRect(), m = 60;
      const d = vert ? (ultimo.y < g.top + m ? -1 : ultimo.y > g.bottom - m ? 1 : 0) : (ultimo.x < g.left + m ? -1 : ultimo.x > g.right - m ? 1 : 0);
      if (d) vert ? (grade.scrollTop += d * 14) : (grade.scrollLeft += d * 14);
      posicionar(); if (d) trocar();
      quadro = requestAnimationFrame(rolarBorda);
    };
    const mover = (ev) => {
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!movido) {
        if (Math.hypot(ultimo.x - p0.x, ultimo.y - p0.y) < 6) return;
        movido = true; card.classList.add("td-arrastando"); grade.classList.add("td-ordenando"); quadro = requestAnimationFrame(rolarBorda);
      }
      posicionar(); trocar();
    };
    const soltar = () => {
      removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); removeEventListener("pointercancel", soltar);
      cancelAnimationFrame(quadro);
      if (!movido) return;
      card.classList.remove("td-arrastando"); grade.classList.remove("td-ordenando"); card.style.transform = "";
      gravarOrdem();
    };
    // no window, não com setPointerCapture: mover a coluna no DOM derruba a captura e o "soltar" se perderia
    addEventListener("pointermove", mover); addEventListener("pointerup", soltar); addEventListener("pointercancel", soltar);
  });
  // teclado: setas na alça movem a coluna uma posição
  grade.addEventListener("keydown", (e) => {
    const alca = e.target.closest("[data-arrastar]"); if (!alca) return;
    const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!d) return;
    e.preventDefault();
    const card = alca.closest(".td-cartao"), viz = d < 0 ? card.previousElementSibling : card.nextElementSibling;
    if (!viz?.classList.contains("td-cartao")) return;
    d < 0 ? grade.insertBefore(card, viz) : grade.insertBefore(viz, card);
    alca.focus(); card.scrollIntoView({ block: "nearest", inline: "nearest" });
    gravarOrdem();
  });

  // ── controles do topo ───────────────────────────────────────────────────────
  const estreito = matchMedia("(max-width: 1100px)");
  const fecharMenu = () => { meta.classList.remove("td-aberto"); menu.setAttribute("aria-expanded", "false"); };
  menu.addEventListener("click", () => { const a = meta.classList.toggle("td-aberto"); menu.setAttribute("aria-expanded", String(a)); });
  estreito.addEventListener?.("change", fecharMenu);
  raiz.addEventListener("click", (e) => {
    if (e.target.closest("[data-gerenciar]")) return abrirGer();
    if (e.target.closest("[data-atualizar]")) { memo = new Map(); cat = null; return recarregar(); }
    if (estreito.matches && meta.classList.contains("td-aberto") && !meta.contains(e.target) && !menu.contains(e.target)) fecharMenu();
  });
  $("[data-chip-filtro]").addEventListener("click", (e) => {     // o chip inteiro abre a lista
    const s = $("[data-filtro]"); if (e.target === s) return;
    try { s.showPicker(); } catch { s.focus(); }
  });
  $("[data-filtro]").addEventListener("change", (e) => { est.filtro = e.target.value; salvar(); painel(); });
  $("[data-disposicao]").addEventListener("change", (e) => { layout(e.target.value); salvar(); grade.scrollTo(0, 0); });
  $("[data-tema-chave]").addEventListener("change", (e) => { tema(e.target.checked ? "escuro" : "claro"); salvar(); });
  // no documento: depois de redesenhar o gerenciador o foco pode sair da raiz
  const teclas = (e) => {
    if (!raiz.isConnected) return document.removeEventListener("keydown", teclas);
    if (e.key === "Escape") { if (!ger.hidden) fecharGer(); else fecharMenu(); }
  };
  document.addEventListener("keydown", teclas);
  // a Estante ou as curtidas mudaram (outra aba, ou a página Estante) → os ícones acompanham
  const reacender = () => raiz.querySelectorAll(".td-item").forEach((art) => {
    const link = art.querySelector(".td-link")?.getAttribute("href") || "", s = salva({ link }), c = curtidas.has(link);
    const bs = art.querySelector('[data-acao="salvar"]'), bc = art.querySelector('[data-acao="curtir"]');
    if (bs && bs.getAttribute("aria-pressed") !== String(s)) { bs.setAttribute("aria-pressed", s); bs.setAttribute("aria-label", s ? "Remover da Estante" : "Salvar na Estante"); }
    if (bc && bc.getAttribute("aria-pressed") !== String(c)) { bc.setAttribute("aria-pressed", c); bc.setAttribute("aria-label", c ? "Descurtir" : "Curtir"); }
  });
  addEventListener("storage", (e) => {
    if (!raiz.isConnected) return;
    if (e.key === "odin:estante") { naEstante = null; reacender(); }
    if (e.key === "odin:" + CURTIDAS) { curtidas = new Set(ler(CURTIDAS, [])); reacender(); }
  });
  // outra aba mudou a lista, o filtro ou o tema → acompanha
  addEventListener("storage", (e) => {
    if (e.key !== "odin:" + CHAVE || !raiz.isConnected) return;
    Object.assign(est, ler(CHAVE, {})); tema(est.tema); layout(est.layout); $("[data-filtro]").value = est.filtro; if (!ger.hidden) desenharGer(); painel();
  });

  async function recarregar() {
    situacao("Buscando os feeds", "carregando");
    if (!cat) cat = await catalogo(true).catch(() => ({ colunas: [], feeds: [], todos: [], dia: "" }));
    painel();
  }
  painel();
}

function hostDe(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } }
