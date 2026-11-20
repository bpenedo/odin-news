// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Estante — "ler depois" 100 % local para estudante: salvos, arquivo, favoritos, tags, modo leitura,
// destaques com nota, revisão diária com repetição espaçada (Leitner) e exportação Markdown/JSON.
// Armazenamento: localStorage do navegador (chave odin:estante). Nada sai da máquina.

const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
const { aplicarTema, barraConforto, carregarCss, carregarPainel, debounce, dominio, esc, fmtData, gravar, ler,
  minutosLeitura, posHTML, toast, baixar } = await import("./comum.js" + VERSAO);

const MARCA = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="7" fill="#ef4056"/><path d="M10 13l6 6 6-6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const VISOES = [["inicio", "🏠", "Início"], ["salvos", "🔖", "Salvos"], ["arquivo", "🗃", "Arquivo"], ["favoritos", "⭐", "Favoritos"],
                ["destaques", "🖍", "Destaques"], ["revisao", "🔁", "Revisão diária"]];

export async function montar(raiz) {
  carregarCss("/odin/temas.css"); carregarCss("/odin/estante.css");
  raiz.classList.add("odin-app", "odin-estante");
  await aplicarTema(raiz);
  const painel = await carregarPainel().catch(() => null);
  let est = ler("estante", []);
  const PAGINA = 120;   // cartões por vez: 5 mil de uma só vez travariam o celular
  const ui = { visao: "salvos", tag: "", busca: "", ordem: "recentes", modo: "grade", ...ler("estanteUI", {}), lendo: null, limite: PAGINA };
  const salvar = () => { gravar("estante", est); };
  const salvarUI = () => gravar("estanteUI", { visao: ui.visao, ordem: ui.ordem, modo: ui.modo });

  raiz.innerHTML = `
    <header class="es-topo">
      <span class="es-marca">${MARCA} Estante</span>
      <label class="es-busca">🔍<input type="search" placeholder="Buscar na Estante" data-busca></label>
      <button class="es-btn es-prim" data-add>＋ Salvar URL</button>
      <span data-conf style="margin-left:auto"></span>
    </header>
    <div class="es-corpo"><nav class="es-lateral" aria-label="Estante"></nav><main class="es-main"></main></div>`;
  raiz.querySelector("[data-conf]").appendChild(barraConforto(raiz));
  const nav = raiz.querySelector(".es-lateral"), main = raiz.querySelector(".es-main");

  const contagem = () => ({
    inicio: est.length, salvos: est.filter((x) => !x.arquivado).length, arquivo: est.filter((x) => x.arquivado).length,
    favoritos: est.filter((x) => x.favorito).length, destaques: est.reduce((n, x) => n + (x.destaques?.length || 0), 0),
    revisao: revisaoHoje().length,
  });
  function desenharNav() {
    const n = contagem();
    const tags = [...new Set(est.flatMap((x) => x.tags || []))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    nav.innerHTML = VISOES.map(([id, ic, nome]) => `<button data-visao="${id}" aria-current="${ui.visao === id && !ui.tag}">${ic} ${nome}<span class="es-n">${n[id] || ""}</span></button>`).join("") +
      `<h5>Tags</h5><div class="es-tagsl">${tags.slice(0, 40).map((t) => `<button data-tag="${esc(t)}" aria-current="${ui.tag === t}"># ${esc(t)}</button>`).join("") || `<small style="padding:0 12px;color:var(--odin-suave)">sem tags</small>`}</div>
      <h5>Dados</h5><button data-exp>⬇ Exportar JSON</button><button data-expmd>⬇ Destaques (.md)</button>
      <label class="es-btn" style="margin:6px 12px;display:inline-block">⬆ Importar<input type="file" accept=".json,.csv,.html,.htm,application/json,text/csv,text/html" data-imp hidden></label>
      <small style="display:block;padding:0 12px;color:var(--odin-suave)">Backup do ODIN ou exportação do Pocket (JSON, CSV, HTML)</small>`;
  }

  function lista() {
    const q = ui.busca.toLowerCase();
    let r = est.filter((x) => {
      if (ui.tag) return (x.tags || []).includes(ui.tag);
      if (ui.visao === "salvos") return !x.arquivado;
      if (ui.visao === "arquivo") return x.arquivado;
      if (ui.visao === "favoritos") return x.favorito;
      return true;
    });
    if (q) r = r.filter((x) => `${x.titulo} ${x.resumo || ""} ${x.fonte || ""} ${x.url} ${(x.tags || []).join(" ")}`.toLowerCase().includes(q));
    r.sort((a, b) => (ui.ordem === "antigos" ? 1 : -1) * (a.salvo < b.salvo ? -1 : 1));
    return r;
  }

  function cartao(x) {
    const ini = (x.fonte || dominio(x.url) || "?").trim()[0]?.toUpperCase() || "?";
    return `<article class="es-cartao" data-id="${esc(x.id)}">
      <div class="es-capa">${x.imagem ? `<img src="${esc(x.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(ini)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1">
        <h3 data-ler>${esc(x.titulo)}</h3>
        <div class="es-meta">${esc(dominio(x.url))} · ${minutosLeitura(x.resumo)} min de leitura${x.destaques?.length ? ` · 🖍 ${x.destaques.length}` : ""}</div>
        ${x.tags?.length ? `<div class="es-tags">${x.tags.slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="es-acoes">
          <button data-fav aria-pressed="${!!x.favorito}" title="Favoritar">${x.favorito ? "★" : "☆"}</button>
          <button data-arq aria-pressed="${!!x.arquivado}" title="${x.arquivado ? "Mover para Salvos" : "Arquivar"}">${x.arquivado ? "↩" : "✓"}</button>
          <button data-tagar title="Editar tags">🏷</button>
          <a href="${esc(x.url)}" target="_blank" rel="noopener"><button title="Abrir original">↗</button></a>
          <button data-del title="Excluir">🗑</button>
        </div>
      </div></article>`;
  }

  function desenhar() {
    desenharNav();
    if (ui.lendo) return desenharLeitor(est.find((x) => x.id === ui.lendo));
    if (ui.visao === "destaques" && !ui.tag) return desenharDestaques();
    if (ui.visao === "revisao" && !ui.tag) return desenharRevisao();
    const r = lista();
    const titulo = ui.tag ? `# ${ui.tag}` : (VISOES.find(([id]) => id === ui.visao) || VISOES[1])[2];
    const sugestoes = ui.visao === "inicio" && painel ? `<h3 style="font:700 1.2em Georgia;margin:26px 0 10px">Recomendado hoje pelo Jornal</h3>
      <div class="es-grade">${painel.categorias.slice(0, 8).map((c) => { const m = (painel.manchetes[c.id] || [])[0]; return m ? `<article class="es-cartao" data-sug="${esc(m.id)}">
        <div class="es-capa">${m.imagem ? `<img src="${esc(m.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(c.emoji)}</div>
        <h3><a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.titulo)}</a></h3><div class="es-meta">${esc(c.nome)} · ${esc(m.fonte)}</div>
        <div class="es-acoes"><button data-salvar-sug class="es-btn">＋ Salvar</button></div></article>` : ""; }).join("")}</div>` : "";
    main.innerHTML = `<div class="es-cab"><h2>${esc(titulo)}</h2>
        <select data-ordem><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option></select>
        <button class="es-btn" data-modo title="Grade / lista">${ui.modo === "grade" ? "☰ Lista" : "▦ Grade"}</button></div>
      ${r.length ? `<div class="es-grade ${ui.modo === "lista" ? "es-lista" : ""}">${r.slice(0, ui.limite).map(cartao).join("")}</div>
        ${r.length > ui.limite ? `<p style="text-align:center;margin:22px 0"><button class="es-btn" data-mais>Mostrar mais (${(r.length - ui.limite).toLocaleString("pt-BR")} restantes)</button></p>` : ""}`
        : `<div class="es-vazio"><b>Nada por aqui ainda</b>Use “＋” nas notícias do Portal ou “＋ Salvar URL” para guardar leituras.</div>`}
      ${sugestoes}`;
    main.querySelector("[data-ordem]").value = ui.ordem;
  }

  // ── modo leitura + destaques (seleção de texto → destacar com nota) ─────
  function desenharLeitor(x) {
    if (!x) { ui.lendo = null; return desenhar(); }
    const p = painel?.manchetes ? Object.values(painel.manchetes).flat().find((m) => m.id === x.id) : null;
    let texto = esc(x.resumo || "Sem texto disponível no feed — abra o original para a matéria completa.");
    for (const d of x.destaques || []) texto = texto.replace(esc(d.texto), `<mark>${esc(d.texto)}</mark>`);
    main.innerHTML = `<div class="es-leitor">
      <div class="es-barra"><button class="es-btn" data-voltar>← Voltar</button>
        <button class="es-btn" data-fav aria-pressed="${!!x.favorito}">${x.favorito ? "★ Favorito" : "☆ Favoritar"}</button>
        <button class="es-btn" data-arq>${x.arquivado ? "↩ Desarquivar" : "✓ Arquivar"}</button>
        <a class="es-btn" href="${esc(x.url)}" target="_blank" rel="noopener">↗ Original</a>
        <small style="margin-left:auto;color:var(--odin-suave)">Selecione um trecho para destacar</small></div>
      <h1>${esc(x.titulo)}</h1>
      <div class="es-meta">${esc(x.fonte)} · ${esc(dominio(x.url))} · salvo em ${esc(fmtData(x.salvo))}</div>
      ${p?.pos?.length ? `<p style="font:1em/1.9 Georgia;margin-top:8px">${posHTML(p.pos)}</p>` : ""}
      ${x.imagem ? `<img class="es-hero" src="${esc(x.imagem)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
      <div class="es-texto" data-texto>${texto}</div>
      ${x.destaques?.length ? `<h3 style="font:700 1.1em Georgia;margin-top:28px">🖍 Seus destaques</h3><ul class="es-destaques">${x.destaques.map((d, k) =>
        `<li>${esc(d.texto)}${d.nota ? `<small>📝 ${esc(d.nota)}</small>` : ""}<small>${esc(fmtData(d.data))} <button data-del-dest="${k}" class="es-btn" style="padding:0 6px">✕</button></small></li>`).join("")}</ul>` : ""}
    </div>`;
    main.dataset.id = x.id;
  }
  function desenharDestaques() {
    const ds = est.flatMap((x) => (x.destaques || []).map((d) => ({ ...d, x })));
    main.innerHTML = `<div class="es-cab"><h2>Destaques</h2></div>` + (ds.length ? `<ul class="es-destaques">${ds.map((d) =>
      `<li>${esc(d.texto)}${d.nota ? `<small>📝 ${esc(d.nota)}</small>` : ""}<small><a href="#" data-abrir="${esc(d.x.id)}">${esc(d.x.titulo)}</a> · ${esc(fmtData(d.data))}</small></li>`).join("")}</ul>`
      : `<div class="es-vazio"><b>Nenhum destaque</b>Abra uma leitura, selecione um trecho e clique em “Destacar”.</div>`);
  }

  // revisão diária — caixas de Leitner: acertou sobe de caixa (intervalo 1,2,4,8,16 dias)
  function revisaoHoje() {
    const hoje = new Date().toISOString().slice(0, 10);
    return est.flatMap((x) => (x.destaques || []).map((d, k) => ({ d, k, x }))).filter(({ d }) => (d.proxima || "") <= hoje).slice(0, 5);
  }
  function desenharRevisao() {
    const fila = revisaoHoje();
    if (!fila.length) { main.innerHTML = `<div class="es-vazio"><b>Revisão do dia concluída 🎉</b>Volte amanhã — seus destaques reaparecem em intervalos crescentes.</div>`; return; }
    const { d, x } = fila[0];
    main.innerHTML = `<div class="es-revisao"><h2 style="font:700 1.5em Georgia">Revisão diária</h2><p class="es-meta">${fila.length} destaque(s) para hoje</p>
      <blockquote>${esc(d.texto)}</blockquote><p class="es-meta">${esc(x.titulo)} — ${esc(x.fonte)}</p>
      <p><button class="es-btn" data-rev="0">Esqueci</button> <button class="es-btn es-prim" data-rev="1">Lembrei</button></p></div>`;
    main.dataset.rev = x.id + "|" + fila[0].k;
  }

  // ── eventos ──────────────────────────────────────────────────────────────
  const achar = (el) => est.find((x) => x.id === el.closest("[data-id]")?.dataset.id) || est.find((x) => x.id === main.dataset.id);
  nav.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.visao) { ui.visao = b.dataset.visao; ui.tag = ""; ui.lendo = null; ui.limite = PAGINA; salvarUI(); desenhar(); }
    if (b.dataset.tag) { ui.tag = b.dataset.tag; ui.lendo = null; ui.limite = PAGINA; desenhar(); }
    if (b.hasAttribute("data-exp")) baixar(`estante-odin-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(est, null, 1));
    if (b.hasAttribute("data-expmd")) baixar("destaques-odin.md", est.filter((x) => x.destaques?.length).map((x) =>
      `## ${x.titulo}\n${x.url}\n\n${x.destaques.map((d) => `> ${d.texto}${d.nota ? `\n\n📝 ${d.nota}` : ""}`).join("\n\n")}\n`).join("\n---\n\n"), "text/markdown");
  });
  nav.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-imp]")) return;
    const arq = e.target.files[0]; e.target.value = "";   // permite escolher o mesmo arquivo de novo
    if (!arq) return;
    try {
      const { itensDeTexto, mesclar } = await import("./estante-import.js" + VERSAO);
      const { itens, formato } = itensDeTexto(await arq.text(), arq.name);
      if (!itens.length) return toast("⚠️ Nenhum link válido no arquivo");
      const m = mesclar(est, itens);
      if (!gravar("estante", m.est)) return;   // armazenamento cheio: nada muda e o aviso já foi dado (BUG-042)
      est = m.est;
      const fav = itens.some((x) => x.tags?.includes("pocket"));
      if (fav) { ui.visao = "favoritos"; ui.tag = ""; salvarUI(); }
      ui.lendo = null; ui.limite = PAGINA; desenhar();
      toast(`⬆ ${formato}: ${m.novos.toLocaleString("pt-BR")} itens importados${m.repetidos ? `, ${m.repetidos.toLocaleString("pt-BR")} repetido(s) ignorado(s)` : ""}${fav ? " · em ⭐ Favoritos" : ""}`);
    } catch (err) { toast(`⚠️ Arquivo inválido: ${err.message || err}`); }
  });
  main.addEventListener("click", (e) => {
    const b = e.target.closest("button, h3[data-ler], a[data-abrir]"); if (!b) return;
    if (b.matches("[data-abrir]")) { e.preventDefault(); ui.lendo = b.dataset.abrir; return desenhar(); }
    if (b.hasAttribute("data-ler")) { ui.lendo = b.closest("[data-id]").dataset.id; return desenhar(); }
    if (b.hasAttribute("data-voltar")) { ui.lendo = null; return desenhar(); }
    if (b.hasAttribute("data-mais")) { ui.limite += PAGINA * 4; return desenhar(); }
    if (b.hasAttribute("data-modo")) { ui.modo = ui.modo === "grade" ? "lista" : "grade"; salvarUI(); return desenhar(); }
    if (b.hasAttribute("data-salvar-sug")) {
      const m = Object.values(painel.manchetes).flat().find((y) => y.id === b.closest("[data-sug]").dataset.sug);
      if (m && !est.some((x) => x.id === m.id)) { est.unshift({ id: m.id, url: m.link, titulo: m.titulo, fonte: m.fonte, resumo: m.resumo, tags: m.tags, imagem: m.imagem, coluna: m.coluna, salvo: new Date().toISOString(), destaques: [] }); salvar(); toast("🔖 Salvo"); desenhar(); }
      return;
    }
    if (b.dataset.rev !== undefined) {
      const [id, k] = main.dataset.rev.split("|"); const x = est.find((y) => y.id === id); const d = x.destaques[Number(k)];
      d.caixa = b.dataset.rev === "1" ? Math.min((d.caixa || 0) + 1, 5) : 0;
      const prox = new Date(); prox.setDate(prox.getDate() + 2 ** (d.caixa || 0)); d.proxima = prox.toISOString().slice(0, 10);
      salvar(); return desenhar();
    }
    const x = achar(b); if (!x) return;
    if (b.hasAttribute("data-fav")) x.favorito = !x.favorito;
    else if (b.hasAttribute("data-arq")) { x.arquivado = !x.arquivado; toast(x.arquivado ? "✓ Arquivado" : "↩ De volta aos Salvos"); }
    else if (b.hasAttribute("data-del")) { if (!confirm("Excluir esta leitura da Estante?")) return; est = est.filter((y) => y !== x); }
    else if (b.hasAttribute("data-tagar")) { const t = prompt("Tags separadas por vírgula", (x.tags || []).join(", ")); if (t === null) return; x.tags = t.split(",").map((s) => s.trim()).filter(Boolean); }
    else if (b.dataset.delDest !== undefined) x.destaques.splice(Number(b.dataset.delDest), 1);
    else return;
    salvar(); desenhar();
  });
  main.addEventListener("change", (e) => { if (e.target.matches("[data-ordem]")) { ui.ordem = e.target.value; salvarUI(); desenhar(); } });

  // seleção de texto no leitor → balão "Destacar / + nota"
  let pop;
  main.addEventListener("mouseup", () => {
    pop?.remove();
    const s = window.getSelection(); const txt = s.toString().trim();
    if (!ui.lendo || txt.length < 4 || !main.querySelector("[data-texto]")?.contains(s.anchorNode)) return;
    const r = s.getRangeAt(0).getBoundingClientRect(), rr = raiz.getBoundingClientRect();
    pop = Object.assign(document.createElement("div"), { className: "es-pop", innerHTML: `<button data-h>🖍 Destacar</button><button data-hn>📝 + nota</button>` });
    pop.style.left = (r.left - rr.left) + "px"; pop.style.top = (r.top - rr.top - 40) + "px";
    raiz.appendChild(pop);
    pop.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      const x = est.find((y) => y.id === ui.lendo);
      const nota = ev.target.matches("[data-hn]") ? (prompt("Nota para este destaque:") || "") : "";
      (x.destaques ||= []).push({ texto: txt, nota, data: new Date().toISOString(), caixa: 0, proxima: new Date().toISOString().slice(0, 10) });
      salvar(); pop.remove(); s.removeAllRanges(); desenhar(); toast("🖍 Destaque salvo");
    });
  });

  raiz.querySelector("[data-busca]").addEventListener("input", debounce((e) => { ui.busca = e.target.value; ui.lendo = null; ui.limite = PAGINA; desenhar(); }, 150));
  raiz.querySelector("[data-add]").addEventListener("click", () => {
    const url = prompt("URL para salvar na Estante:"); if (!url || !/^https?:\/\//.test(url)) return;
    const titulo = prompt("Título (opcional):", dominio(url)) || dominio(url);
    est.unshift({ id: "u" + Date.now().toString(36), url, titulo, fonte: dominio(url), resumo: "", tags: [], salvo: new Date().toISOString(), destaques: [] });
    salvar(); desenhar(); toast("🔖 Salvo");
  });
  window.addEventListener("odin:estado", (e) => { if (e.detail.chave === "estante") { est = ler("estante", []); } });
  desenhar();
}
