// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Flip — folhear notícias como uma revista, com dobra 3D real.
//  • Computador: folha vira na HORIZONTAL (lombada vertical), capa + layouts alternados.
//  • Celular/tablet em pé (Android/iOS): folha vira na VERTICAL — a metade de baixo dobra sobre a
//    linha do meio e ACOMPANHA O DEDO (arrastar para cima = próxima; para baixo = anterior); soltar
//    depois da metade ou com um gesto rápido completa a virada, senão a folha volta. Uma história
//    grande ou duas empilhadas por página, tela cheia.
//  • Cada história: ♥ Curtir · 💬 Comentar · ↗ Compartilhar (folha nativa do sistema no celular) ·
//    🔖 Salvar na Estante (Pocket local). Tudo gravado só no navegador.
//  • ✨ Para você: curtidas, salvamentos, compartilhamentos, comentários, aberturas e páginas vistas
//    alimentam o ALGORITMO GENÉTICO (genetico.js, num Web Worker), que reordena as notícias pelo seu
//    gosto e exporta interesses.json para o motor BUSCAR mais desse tipo.
// Teclado ← → ↑ ↓, rodinha do mouse, arrastar com o mouse ou com o dedo.

const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
const { aplicarTema, barraConforto, carregarPainel, carregarCss, rota, debounce, esc, fmtData, ler, truncar, gravar, toast, baixar } = await import("./comum.js" + VERSAO);
const { atributos, rotulo, ranquear, interesses, MIN_POSITIVOS } = await import("./genetico.js" + VERSAO);

const CORES = ["#c0392b", "#2471a3", "#1e8449", "#7d3c98", "#b9770e", "#117a65", "#a93226", "#2e4053", "#6c3483", "#1a5276", "#b03a2e", "#196f3d", "#9c640c", "#5b2c6f"];
const ICONE = {
  like: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a4.7 4.7 0 0 1 6.6-6.7l.8.8.8-.8a4.7 4.7 0 0 1 6.6 6.7z"/></svg>`,
  comentar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>`,
  compartilhar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v7h14v-7"/></svg>`,
  salvar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>`,
};
const ESTILO = `
.fl-app{font-family:"Helvetica Neue",Arial,sans-serif;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.fl-topo{display:flex;align-items:center;gap:8px 10px;padding:8px 14px;flex-wrap:wrap}
.fl-topo h2{font:800 1.35em Georgia,serif;margin:0 auto 0 0;white-space:nowrap}.fl-topo h2 a{color:inherit;text-decoration:none}.fl-voltar{display:none}.fl-v .fl-voltar{display:inline}.fl-topo h2 span{color:#f52828}
.fl-topo select,.fl-topo button,.fl-conf>summary{font:12px Arial;border:1px solid var(--odin-borda);background:var(--odin-cartao);color:var(--odin-texto);border-radius:4px;padding:5px 9px;cursor:pointer}
.fl-conf{position:relative}.fl-conf>summary{list-style:none}.fl-conf>summary::-webkit-details-marker{display:none}
.fl-conf[open]>div{position:absolute;right:0;top:110%;z-index:30;background:var(--odin-cartao);border:1px solid var(--odin-borda);border-radius:6px;padding:8px;box-shadow:0 8px 30px #0004;width:max-content;max-width:92vw}
.fl-palco{position:relative;margin:0 auto;width:min(1100px,100%);aspect-ratio:16/10;perspective:2600px;-webkit-perspective:2600px;max-height:78vh;touch-action:pan-y;outline:none}
.fl-pag{position:absolute;inset:0;background:var(--odin-cartao);box-shadow:0 10px 40px #0003;border-radius:4px;overflow:hidden;display:grid;gap:2px;padding:0}
.fl-folha{position:absolute;z-index:5;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transition:transform .6s cubic-bezier(.3,.1,.25,1);pointer-events:none;will-change:transform}
.fl-folha.fl-arrasto{transition:none}
.fl-face{position:absolute;inset:0;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.fl-face>.fl-pag{box-shadow:none;border-radius:0}
.fl-sombra{position:absolute;inset:0;pointer-events:none;opacity:0}
/* horizontal (computador) */
.fl-h .fl-folha{top:0;bottom:0;left:50%;width:50%;transform-origin:left center}
.fl-h .fl-folha.fl-volta{left:0;transform-origin:right center}
.fl-h .fl-face>.fl-pag{top:0;width:200%;height:100%}
.fl-h .fl-frente>.fl-pag{left:-100%}.fl-h .fl-verso>.fl-pag{left:0}
.fl-h .fl-volta .fl-frente>.fl-pag{left:0}.fl-h .fl-volta .fl-verso>.fl-pag{left:-100%}
.fl-h .fl-verso{transform:rotateY(180deg)}.fl-h .fl-sombra{background:linear-gradient(90deg,#0000,#0005)}
/* vertical (celular/tablet em pé) */
.fl-v.fl-app{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;background:var(--odin-fundo);padding-top:env(safe-area-inset-top);overflow:hidden}
.fl-v .fl-topo{flex:none;flex-wrap:nowrap}.fl-v .fl-topo select{max-width:42vw}.fl-v [data-aviso]{flex:none}
.fl-v .fl-palco{flex:1;min-height:0;width:100%;aspect-ratio:auto;max-height:none;touch-action:none;overscroll-behavior:contain;perspective:1800px;-webkit-perspective:1800px}
.fl-v .fl-folha{left:0;right:0;top:50%;height:50%;transform-origin:center top}
.fl-v .fl-folha.fl-volta{top:0;transform-origin:center bottom}
.fl-v .fl-face>.fl-pag{left:0;width:100%;height:200%}
.fl-v .fl-frente>.fl-pag{top:-100%}.fl-v .fl-verso>.fl-pag{top:0}
.fl-v .fl-volta .fl-frente>.fl-pag{top:0}.fl-v .fl-volta .fl-verso>.fl-pag{top:-100%}
.fl-v .fl-verso{transform:rotateX(180deg)}.fl-v .fl-sombra{background:linear-gradient(180deg,#0000,#0006)}
.fl-v .fl-pag{border-radius:0}
.fl-hist{position:relative;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;background:#222}
.fl-hist .fl-img{position:absolute;inset:0;background-size:cover;background-position:center;transition:transform 6s ease}
@media(hover:hover){.fl-hist:hover .fl-img{transform:scale(1.05)}}
.fl-hist .fl-txt{position:relative;padding:5% 6% 3%;background:linear-gradient(transparent,#000c 45%)}
.fl-hist h3{font:800 calc(1.5em*var(--odin-escala))/1.12 Georgia,"Times New Roman",serif;margin:0 0 .35em;text-shadow:0 1px 3px #0008}
.fl-hist.fl-g h3{font-size:calc(2.6em*var(--odin-escala))}.fl-hist.fl-m h3{font-size:calc(1.8em*var(--odin-escala))}
.fl-hist p{margin:0 0 .5em;font-size:.95em;line-height:1.4;opacity:.92}
.fl-hist small{font:700 .72em Arial;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.fl-cat{display:inline-block;background:#f52828;color:#fff;font:800 .68em Arial;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;margin-bottom:.6em}
.fl-capa{grid-template:1fr/1fr}.fl-l1{grid-template:1fr/1fr}.fl-l2{grid-template:1fr 1fr/1.6fr 1fr}.fl-l2>:first-child{grid-row:span 2}
.fl-l3{grid-template:1fr 1fr/1fr 1fr}.fl-l4{grid-template:1fr/1fr 1fr 1fr}.fl-m2{grid-template:1fr 1fr/1fr}
.fl-masthead{position:absolute;top:5%;left:6%;right:6%;z-index:2;display:flex;justify-content:space-between;color:#fff;text-shadow:0 1px 4px #000a;pointer-events:none}
.fl-masthead b{font:900 3.2em/1 Georgia,serif}.fl-masthead span{font:700 .85em Arial;letter-spacing:.12em;text-transform:uppercase;align-self:flex-end}
.fl-acoes{display:flex;align-items:center;gap:2px;margin:.55em 0 0 -8px}
.fl-acoes button{display:inline-flex;align-items:center;gap:4px;min-width:40px;height:40px;padding:0 8px;border:0;border-radius:20px;background:transparent;color:#fff;font:700 13px Arial;cursor:pointer}
.fl-acoes button:hover,.fl-acoes button:focus-visible{background:#ffffff26;outline:none}
.fl-acoes svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 1px 2px #0009)}
.fl-acoes [data-a=like][aria-pressed=true]{color:#ff3b4a}.fl-acoes [data-a=like][aria-pressed=true] svg{fill:currentColor}
.fl-acoes [data-a=salvar][aria-pressed=true] svg{fill:currentColor}
.fl-acoes .fl-rot{font-weight:600}.fl-acoes .fl-esp{flex:1}
.fl-pop{animation:fl-pop .35s ease}@keyframes fl-pop{40%{transform:scale(1.35)}}
.fl-nav{display:flex;justify-content:center;align-items:center;gap:14px;margin:12px 0}
.fl-nav button{width:44px;height:44px;border-radius:50%;border:1px solid var(--odin-borda);background:var(--odin-cartao);color:var(--odin-texto);font-size:20px;cursor:pointer}
.fl-pontos{display:flex;gap:5px;flex-wrap:wrap;max-width:60vw;justify-content:center}.fl-pontos i{width:7px;height:7px;border-radius:50%;background:var(--odin-borda)}.fl-pontos i.on{background:#f52828}
.fl-v .fl-nav{flex:none;margin:0;padding:6px 0 calc(6px + env(safe-area-inset-bottom));gap:8px}.fl-v .fl-nav button{display:none}
.fl-aviso{margin:0 14px 8px;padding:8px 10px;border-left:4px solid #f52828;background:var(--odin-cartao);font-size:13px}
.fl-folhinha{position:fixed;left:0;right:0;bottom:0;z-index:60;max-height:75vh;display:flex;flex-direction:column;background:var(--odin-cartao);color:var(--odin-texto);border-radius:14px 14px 0 0;box-shadow:0 -10px 40px #0005;padding:10px 16px calc(12px + env(safe-area-inset-bottom));animation:fl-sobe .25s ease;user-select:text;-webkit-user-select:text}
@keyframes fl-sobe{from{transform:translateY(100%)}}
.fl-folhinha::before{content:"";align-self:center;width:40px;height:4px;border-radius:2px;background:var(--odin-borda);margin-bottom:8px}
.fl-folhinha h4{margin:0 0 6px;font:700 15px Arial}.fl-folhinha ul{list-style:none;margin:0;padding:0;overflow:auto;flex:1}
.fl-folhinha li{padding:8px 0;border-bottom:1px solid var(--odin-borda);font-size:14px;line-height:1.4}.fl-folhinha li small{display:block;opacity:.65;font-size:11px}
.fl-folhinha form{display:flex;gap:8px;margin-top:8px}.fl-folhinha textarea{flex:1;font:16px Arial;min-height:44px;padding:8px;border:1px solid var(--odin-borda);border-radius:8px;background:transparent;color:inherit;resize:vertical}
.fl-folhinha button{font:700 14px Arial;border:0;border-radius:8px;padding:0 14px;background:#f52828;color:#fff;cursor:pointer;min-height:44px}
.fl-fundo{position:fixed;inset:0;z-index:59;background:#0006}
.fl-gosto .fl-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.fl-gosto .fl-chips span{padding:3px 9px;border-radius:12px;background:#f5282822;border:1px solid #f5282866;font-size:13px}
.fl-gosto svg{width:100%;height:46px}.fl-gosto .fl-linha{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.fl-gosto .fl-linha button{background:var(--odin-borda);color:var(--odin-texto)}
@media(max-width:700px){.fl-l2,.fl-l3,.fl-l4{grid-template:repeat(3,1fr)/1fr}.fl-l2>:first-child{grid-row:auto}.fl-hist.fl-g h3{font-size:calc(1.75em*var(--odin-escala))}.fl-hist.fl-m h3{font-size:calc(1.3em*var(--odin-escala))}.fl-masthead b{font-size:2.4em}.fl-topo{padding:6px 10px}.fl-topo h2{font-size:1.15em}.fl-acoes .fl-rot,.fl-topo .fl-rot{display:none}}
@media(prefers-reduced-motion:reduce){.fl-folha{transition-duration:.01s}}`;

const consultaCelular = "(max-width: 700px), (pointer: coarse) and (orientation: portrait) and (max-width: 1100px)";

export async function montar(raiz) {
  carregarCss("/odin/temas.css");
  if (!document.getElementById("fl-css")) document.head.appendChild(Object.assign(document.createElement("style"), { id: "fl-css", textContent: ESTILO }));
  raiz.classList.add("odin-app", "fl-app");
  await aplicarTema(raiz);
  const p = await carregarPainel();
  const porId = new Map(p.itens.map((i) => [i.id, i]));
  const corCat = Object.fromEntries(p.categorias.map((c, k) => [c.id, CORES[k % CORES.length]]));
  const imgDeManchete = new Map(Object.values(p.manchetes).flat().filter((m) => m.imagem).map((m) => [m.id, m.imagem]));
  const comImagem = (i) => (i.imagem || !imgDeManchete.has(i.id) ? i : { ...i, imagem: imgDeManchete.get(i.id) });

  // ── estado local: sinais (gosto), comentários, genoma ─────────────────────
  let sinais = ler("sinais", {}), comentarios = ler("comentarios", {}), genoma = ler("genoma", null);
  const naEstante = () => new Set(ler("estante", []).map((x) => x.id));
  let estanteIds = naEstante();
  const MAX_SINAIS = 3000;
  const salvarSinais = debounce(() => {
    const ks = Object.keys(sinais);
    if (ks.length > MAX_SINAIS) ks.sort((a, b) => (sinais[a].ts || 0) - (sinais[b].ts || 0)).slice(0, ks.length - MAX_SINAIS).forEach((k) => delete sinais[k]);
    gravar("sinais", sinais);
  }, 400);
  function marcar(i, campo, valor = 1) {
    if (!i?.id) return;
    const s = (sinais[i.id] ||= { a: atributos(comImagem(i)) });
    s[campo] = valor; s.ts = Date.now();
    salvarSinais();
    if (campo !== "visto") reaprender();
  }

  // ── algoritmo genético no Worker ───────────────────────────────────────────
  let worker = null, rodando = false, pendente = false;
  const reaprender = debounce(() => {
    const exemplos = Object.values(sinais).filter((s) => s.a).map((s) => ({ a: s.a, y: rotulo(s) }));
    if (exemplos.filter((e) => e.y > 0).length < MIN_POSITIVOS) return;
    if (rodando) { pendente = true; return; }
    rodando = true;
    try { worker ||= new Worker(new URL("./genetico-worker.js" + VERSAO, import.meta.url), { type: "module" }); }
    catch { rodando = false; return; }
    worker.onmessage = (e) => {
      rodando = false;
      if (e.data.ok && e.data.genoma) {
        const melhorou = !genoma;
        genoma = { ...e.data.genoma, quando: Date.now() }; gravar("genoma", genoma);
        toast(`✨ ${melhorou ? "Seu gosto foi aprendido" : "Gosto refinado"} — aptidão ${(genoma.aptidao * 100).toFixed(0)} % · ${genoma.ms} ms`);
        if (raiz.querySelector(".fl-gosto")) abrirGosto();
      }
      if (pendente) { pendente = false; reaprender(); }
    };
    worker.postMessage({ exemplos, colunas: p.categorias.map((c) => c.id), semente: genoma, opcoes: { aleatorio: Date.now() % 1e9 } });
  }, 1200);

  const fontes = {
    parati: () => (genoma ? ranquear(p.itens.map(comImagem), genoma) : Object.values(p.manchetes).flat().map((m) => porId.get(m.id) || m)),
    filtro: () => (ler("filtro", {}).ids || []).map((id) => porId.get(id)).filter(Boolean),
    selecao: () => (ler("selecao", [])).map((id) => porId.get(id)).filter(Boolean),
    manchetes: () => Object.values(p.manchetes).flat().map((m) => porId.get(m.id) || m),
    estante: () => ler("estante", []).map((x) => ({ id: x.id, titulo: x.titulo, link: x.url, fonte: x.fonte, resumo: x.resumo, imagem: x.imagem, coluna: x.coluna, tags: x.tags })),
  };
  let origem = ler("flipOrigem", genoma ? "parati" : (ler("filtro", {}).ids || []).length ? "filtro" : "manchetes");
  if (!fontes[origem]) origem = "manchetes";
  let itens = [], grupos = [], atual = 0, animando = false;
  const mq = matchMedia(consultaCelular);
  let vertical = mq.matches;

  raiz.innerHTML = `<div class="fl-topo odin-nao-imprimir"><h2><a class="fl-voltar" href="${rota("/portal")}" aria-label="Voltar ao Portal">‹ </a>ODIN <span>Flip</span></h2>
      <label><span class="odin-sr">Folhear</span><select data-origem aria-label="O que folhear">
        <option value="parati">✨ Para você</option><option value="filtro">Filtradas no Portal</option><option value="selecao">Selecionadas no Portal</option>
        <option value="manchetes">Manchetes do Jornal</option><option value="estante">Minha Estante</option></select></label>
      <button data-gosto title="O que o algoritmo genético aprendeu do seu gosto" aria-label="Seu gosto">✨<span class="fl-rot"> Seu gosto</span></button>
      <details class="fl-conf"><summary title="Texto, cores e fundo">Aa</summary><div data-conf></div></details></div>
    <div data-aviso></div>
    <div class="fl-palco" tabindex="0" aria-roledescription="revista" aria-label="Revista de notícias — deslize ou use as setas"></div>
    <div class="fl-nav odin-nao-imprimir"><button data-ant aria-label="Página anterior">‹</button><div class="fl-pontos" aria-live="polite"></div><button data-prox aria-label="Próxima página">›</button></div>`;
  raiz.querySelector("[data-conf]").appendChild(barraConforto(raiz));
  const palco = raiz.querySelector(".fl-palco"), pontos = raiz.querySelector(".fl-pontos"), nav = raiz.querySelector(".fl-nav");
  raiz.querySelector("[data-origem]").value = origem;

  // ── histórias e páginas ────────────────────────────────────────────────────
  const historia = (i, tam) => {
    if (!i) return `<div class="fl-hist" style="background:var(--odin-borda)"></div>`;
    i = comImagem(i);
    const cor = corCat[i.coluna] || "#333", cat = p.nomeCat[i.coluna], s = sinais[i.id] || {};
    const nCom = (comentarios[i.id] || []).length, salvo = estanteIds.has(i.id);
    const fundo = i.imagem ? `background-image:linear-gradient(#0002,#0002),url('${esc(i.imagem)}')` : `background:linear-gradient(135deg,${cor},#111)`;
    return `<article class="fl-hist fl-${tam}" data-id="${esc(i.id)}" data-link="${esc(i.link)}"><div class="fl-img" style="${fundo}"></div>
      <div class="fl-txt">${cat ? `<span class="fl-cat">${esc(cat.emoji)} ${esc(cat.nome)}</span>` : ""}<h3>${esc(truncar(i.titulo, tam === "p" ? 110 : 160))}</h3>
      ${tam !== "p" && i.resumo ? `<p>${esc(truncar(i.resumo, tam === "g" ? (vertical ? 170 : 260) : vertical ? 0 : 150))}</p>` : ""}<small>${esc(i.fonte)}${i.data ? " · " + esc(fmtData(i.data)) : ""}</small>
      <div class="fl-acoes" role="group" aria-label="Ações da notícia">
        <button data-a="like" aria-pressed="${!!s.like}" aria-label="Curtir" title="Curtir — ensina o seu gosto ao ODIN">${ICONE.like}<span class="fl-rot">Curtir</span></button>
        <button data-a="comentar" aria-label="Comentar (${nCom})" title="Comentar">${ICONE.comentar}<span>${nCom || ""}</span></button>
        <button data-a="compartilhar" aria-label="Compartilhar" title="Compartilhar">${ICONE.compartilhar}</button>
        <span class="fl-esp"></span>
        <button data-a="salvar" aria-pressed="${salvo}" aria-label="${salvo ? "Remover da Estante" : "Salvar na Estante"}" title="${salvo ? "Na Estante — toque para remover" : "Salvar na Estante (leitura local)"}">${ICONE.salvar}</button>
      </div></div></article>`;
  };
  function paginar(manterId) {
    itens = fontes[origem]();
    grupos = [];
    if (!itens.length) { grupos.push({ vazio: true }); atual = 0; return; }
    let k = 0;
    grupos.push({ cls: "capa", its: [itens[k++]], tams: ["g"] });
    const layouts = vertical ? [["l1", ["g"]], ["m2", ["m", "m"]], ["m2", ["m", "m"]]]
                             : [["l2", ["g", "m", "m"]], ["l3", ["m", "m", "m", "m"]], ["l4", ["m", "m", "m"]], ["l1", ["g"]]];
    let L = 0;
    while (k < itens.length) { const [cls, tams] = layouts[L++ % layouts.length]; grupos.push({ cls, its: itens.slice(k, k + tams.length), tams }); k += tams.length; }
    atual = manterId ? Math.max(0, grupos.findIndex((g) => g.its?.some((i) => i.id === manterId))) : Math.min(atual, grupos.length - 1);
  }
  function pagHTML(k) {
    const g = grupos[k];
    if (g.vazio) return `<div class="fl-pag fl-capa"><div class="fl-hist" style="background:#222;justify-content:center;text-align:center"><div class="fl-txt"><h3>Nada para folhear</h3><p>Filtre ou selecione notícias no Portal, ou escolha outra origem.</p></div></div></div>`;
    const corpo = g.tams.map((t, j) => historia(g.its[j], t)).join("");
    const mast = g.cls === "capa" ? `<div class="fl-masthead"><b>ODIN</b><span>${origem === "parati" && genoma ? "✨ para você · " : ""}${esc(p.dia.split("-").reverse().join("/"))} · ${itens.length} histórias</span></div>` : "";
    return `<div class="fl-pag fl-${g.cls}">${corpo}${mast}</div>`;
  }
  function aviso() {
    const el = raiz.querySelector("[data-aviso]");
    const n = Object.values(sinais).filter((s) => rotulo(s) > 0).length;
    el.innerHTML = origem === "parati" && !genoma
      ? `<div class="fl-aviso">✨ <b>Para você</b> aprende com o seu ♥. Curta, salve ou compartilhe pelo menos ${MIN_POSITIVOS} histórias (${n}/${MIN_POSITIVOS}) e esta revista passa a vir na ordem do seu gosto. Enquanto isso: manchetes do dia.</div>` : "";
  }
  function dimensionar() {                                    // celular: tela cheia por CSS (flex), como app de revista
    raiz.classList.toggle("fl-v", vertical); raiz.classList.toggle("fl-h", !vertical);
    document.documentElement.style.overflow = vertical ? "hidden" : "";
  }
  function mostrar() {
    palco.innerHTML = pagHTML(atual);
    pontos.innerHTML = grupos.length <= (vertical ? 18 : 60) ? grupos.map((_, k) => `<i class="${k === atual ? "on" : ""}"></i>`).join("") : `<small>${atual + 1} / ${grupos.length}</small>`;
    for (const i of grupos[atual].its || []) if (i && !sinais[i.id]?.visto) marcar(i, "visto");   // visto sem ação = exemplo negativo
  }

  // ── virada de página: animada (botão/tecla) ou guiada pelo dedo/mouse ─────
  let vir = null;
  const clip = (d) => vertical
    ? (d > 0 ? ["inset(0 0 50% 0)", "inset(50% 0 0 0)"] : ["inset(50% 0 0 0)", "inset(0 0 50% 0)"])
    : (d > 0 ? ["inset(0 50% 0 0)", "inset(0 0 0 50%)"] : ["inset(0 0 0 50%)", "inset(0 50% 0 0)"]);
  function iniciar(d) {
    const alvo = atual + d;
    if (animando || alvo < 0 || alvo >= grupos.length) return false;
    animando = true;
    const cur = pagHTML(atual), prox = pagHTML(alvo), [c1, c2] = clip(d);
    const mk = (html, c) => { const t = document.createElement("div"); t.innerHTML = html; const el = t.firstElementChild; el.style.clipPath = el.style.webkitClipPath = c; return el; };
    palco.replaceChildren(mk(cur, c1), mk(prox, c2));
    const folha = document.createElement("div");
    folha.className = "fl-folha fl-arrasto" + (d < 0 ? " fl-volta" : "");
    folha.innerHTML = `<div class="fl-face fl-frente">${cur}<div class="fl-sombra"></div></div><div class="fl-face fl-verso">${prox}<div class="fl-sombra"></div></div>`;
    palco.appendChild(folha);
    vir = { d, alvo, folha, sombras: folha.querySelectorAll(".fl-sombra") };
    return true;
  }
  function aplicar(frac, v = vir) {                                          // v explícito: o rAF pode rodar depois do fim (BUG-043)
    if (!v) return;
    const a = 180 * frac * (vertical ? (v.d > 0 ? 1 : -1) : (v.d > 0 ? -1 : 1));
    v.folha.style.transform = vertical ? `rotateX(${a}deg)` : `rotateY(${a}deg)`;
    const o = Math.sin(Math.PI * frac).toFixed(3);
    v.sombras.forEach((s) => (s.style.opacity = o));
  }
  function terminar(completar) {
    const v = vir; if (!v) return;
    v.folha.classList.remove("fl-arrasto");
    requestAnimationFrame(() => aplicar(completar ? 1 : 0, v));
    let feito = false;
    const fim = () => { if (feito) return; feito = true; if (completar) atual = v.alvo; vir = null; animando = false; mostrar(); };
    v.folha.addEventListener("transitionend", fim, { once: true });
    setTimeout(fim, 900);                                                     // segurança (aba em segundo plano)
  }
  function virar(d) {
    if (!iniciar(d)) return quique(d);
    requestAnimationFrame(() => requestAnimationFrame(() => terminar(true)));
  }
  function quique(d) {                                                        // fim da revista: a folha "resiste"
    if (animando) return;
    const ax = vertical ? "translateY" : "translateX";
    palco.animate?.([{ transform: `${ax}(0)` }, { transform: `${ax}(${-d * 14}px)` }, { transform: `${ax}(0)` }], { duration: 260, easing: "ease-out" });
  }

  let ptr = null, arrastou = false;
  palco.addEventListener("pointerdown", (e) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || animando || e.target.closest(".fl-acoes")) return;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, ini: false, d: 0, hist: [[performance.now(), 0]] };
    arrastou = false;
  });
  palco.addEventListener("pointermove", (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const dl = vertical ? e.clientY - ptr.y : e.clientX - ptr.x, dor = vertical ? e.clientX - ptr.x : e.clientY - ptr.y;
    if (!ptr.ini) {
      if (Math.abs(dl) < 10 || Math.abs(dl) < Math.abs(dor)) return;
      const d = dl < 0 ? 1 : -1;
      arrastou = true;
      if (!iniciar(d)) { quique(d); ptr = null; return; }
      ptr.ini = true; ptr.d = d;
      try { palco.setPointerCapture(e.pointerId); } catch {}
    }
    const tam = vertical ? palco.clientHeight : palco.clientWidth;
    ptr.frac = Math.min(1, Math.max(0, (-dl * ptr.d) / (tam * 0.6)));
    ptr.hist.push([performance.now(), dl]); if (ptr.hist.length > 6) ptr.hist.shift();
    aplicar(ptr.frac);
  });
  const soltar = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const pr = ptr; ptr = null;
    if (!pr.ini) return;
    const [t0, d0] = pr.hist[0], [t1, d1] = pr.hist[pr.hist.length - 1];
    const vel = ((d1 - d0) / Math.max(1, t1 - t0)) * -pr.d;                    // px/ms no sentido da virada
    terminar(e.type !== "pointercancel" && (pr.frac > 0.45 || (vel > 0.45 && pr.frac > 0.08)));
  };
  palco.addEventListener("pointerup", soltar);
  palco.addEventListener("pointercancel", soltar);

  // ── ações: curtir, comentar, compartilhar, salvar na Estante ──────────────
  const itemDe = (el) => { const id = el.closest("[data-id]")?.dataset.id; return porId.get(id) || itens.find((i) => i.id === id); };
  function pop(b) { b.classList.remove("fl-pop"); void b.offsetWidth; b.classList.add("fl-pop"); }
  async function compartilhar(i) {
    const dados = { title: i.titulo, text: `${i.titulo} — via ODIN`, url: i.link };
    try {
      if (navigator.share) { await navigator.share(dados); marcar(i, "compartilhado"); return; }
      await navigator.clipboard.writeText(`${i.titulo}\n${i.link}`);
      marcar(i, "compartilhado"); toast("🔗 Link copiado — cole onde quiser compartilhar");
    } catch (err) {
      if (err?.name !== "AbortError") { prompt("Copie o link para compartilhar:", i.link); marcar(i, "compartilhado"); }
    }
  }
  function salvarEstante(i, b) {
    let est = ler("estante", []);
    if (est.some((x) => x.id === i.id)) {
      est = est.filter((x) => x.id !== i.id); gravar("estante", est); toast("Removida da Estante");
      marcar(i, "salvo", 0);
    } else {
      const c = comImagem(i);
      est.unshift({ id: i.id, url: i.link, titulo: i.titulo, fonte: i.fonte, resumo: i.resumo, tags: i.tags || [], coluna: i.coluna,
        imagem: c.imagem || "", salvo: new Date().toISOString(), favorito: false, arquivado: false, destaques: [] });
      gravar("estante", est); toast("🔖 Salva na Estante");
      marcar(i, "salvo");
    }
    estanteIds = naEstante();
    const on = estanteIds.has(i.id);
    b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? "Remover da Estante" : "Salvar na Estante"); pop(b);
  }
  function abrirComentarios(i) {
    fecharFolhinha();
    const lista = () => (comentarios[i.id] || []).map((c) => `<li>${esc(c.texto)}<small>${esc(new Date(c.data).toLocaleString("pt-BR"))}</small></li>`).join("")
      || `<li><small>Nenhum comentário ainda. Suas notas ficam só neste aparelho.</small></li>`;
    const fundo = Object.assign(document.createElement("div"), { className: "fl-fundo" });
    const f = Object.assign(document.createElement("section"), { className: "fl-folhinha" });
    f.setAttribute("role", "dialog"); f.setAttribute("aria-label", "Comentários");
    f.innerHTML = `<h4>💬 ${esc(truncar(i.titulo, 90))}</h4><ul>${lista()}</ul>
      <form><textarea placeholder="Escreva um comentário…" aria-label="Comentário" maxlength="2000"></textarea><button>Enviar</button></form>`;
    fundo.onclick = fecharFolhinha;
    f.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const ta = f.querySelector("textarea"), t = ta.value.trim(); if (!t) return;
      (comentarios[i.id] ||= []).push({ texto: t, data: new Date().toISOString() }); gravar("comentarios", comentarios);
      ta.value = ""; f.querySelector("ul").innerHTML = lista(); marcar(i, "comentado");
      raiz.querySelectorAll(`[data-id="${CSS.escape(i.id)}"] [data-a=comentar] span`).forEach((s) => (s.textContent = comentarios[i.id].length));
    };
    raiz.append(fundo, f);
    f.querySelector("textarea").focus({ preventScroll: true });
  }
  function fecharFolhinha() { raiz.querySelectorAll(".fl-folhinha,.fl-fundo").forEach((x) => x.remove()); }

  palco.addEventListener("click", (e) => {
    if (animando) return;
    const b = e.target.closest(".fl-acoes button");
    if (b) {
      e.stopPropagation();
      const i = itemDe(b); if (!i) return;
      const a = b.dataset.a;
      if (a === "like") { const on = !(sinais[i.id]?.like); marcar(i, "like", on ? 1 : 0); b.setAttribute("aria-pressed", on); pop(b); }
      else if (a === "comentar") abrirComentarios(i);
      else if (a === "compartilhar") compartilhar(i);
      else if (a === "salvar") salvarEstante(i, b);
      return;
    }
    if (arrastou) { arrastou = false; return; }
    const h = e.target.closest("[data-link]");
    if (h) { const i = itemDe(h); if (i) marcar(i, "aberto"); window.open(h.dataset.link, "_blank", "noopener"); }
  });
  palco.addEventListener("dblclick", (e) => {                                  // toque duplo = curtir (gesto comum em apps de leitura)
    const h = e.target.closest("[data-id]"); if (!h || e.target.closest(".fl-acoes")) return;
    const b = h.querySelector("[data-a=like]"); if (b && b.getAttribute("aria-pressed") !== "true") b.click();
  });

  // ── ✨ Seu gosto: o que o algoritmo genético aprendeu ─────────────────────
  function abrirGosto() {
    fecharFolhinha();
    const n = Object.values(sinais).reduce((a, s) => { const y = rotulo(s); y > 0 ? a.pos++ : a.vis++; return a; }, { pos: 0, vis: 0 });
    const ints = genoma ? interesses(genoma, 12) : [];
    const nome = (x) => x.tipo === "c" ? (p.nomeCat[x.valor] ? `${p.nomeCat[x.valor].emoji} ${p.nomeCat[x.valor].nome}` : x.valor) : x.tipo === "f" ? `📰 ${x.valor}` : `# ${x.valor}`;
    const h = genoma?.historico || [];
    const mn = Math.min(...h, 0.5), mx = Math.max(...h, 1);
    const linha = h.map((v, k) => `${(k / Math.max(1, h.length - 1)) * 300},${44 - ((v - mn) / (mx - mn || 1)) * 40}`).join(" ");
    const fundo = Object.assign(document.createElement("div"), { className: "fl-fundo" });
    const f = Object.assign(document.createElement("section"), { className: "fl-folhinha fl-gosto" });
    f.setAttribute("role", "dialog"); f.setAttribute("aria-label", "Seu gosto");
    f.innerHTML = `<h4>✨ Seu gosto — algoritmo genético local</h4>
      <p style="margin:0;font-size:13px">${n.pos} histórias aprovadas (♥ 🔖 ↗ 💬 ou abertas) · ${n.vis} só vistas. ${genoma
        ? `Melhor genoma: aptidão <b>${(genoma.aptidao * 100).toFixed(1)} %</b> em ${genoma.geracoes} gerações (${genoma.ms} ms, Web Worker) · ${genoma.nomes.length + 2} genes.`
        : `Faltam ${Math.max(0, MIN_POSITIVOS - n.pos)} aprovações para a primeira evolução.`}</p>
      ${h.length ? `<svg viewBox="0 0 300 46" preserveAspectRatio="none" role="img" aria-label="Aptidão por geração"><polyline points="${linha}" fill="none" stroke="#f52828" stroke-width="2"/></svg>` : ""}
      ${ints.length ? `<div class="fl-chips">${ints.map((x) => `<span title="peso ${x.peso}">${esc(nome(x))}</span>`).join("")}</div>` : ""}
      <p style="margin:4px 0 0;font-size:12px;opacity:.75">Para não fechar você numa bolha, 1 em cada 6 histórias de “Para você” vem de fora do seu gosto. Nada sai deste aparelho.</p>
      <div class="fl-linha"><button data-g="exp" ${ints.some((x) => x.tipo === "t") ? "" : "disabled"}>⬇ interesses.json (o motor busca mais disso)</button>
        <button data-g="evoluir">⟳ Evoluir agora</button><button data-g="zerar">Zerar aprendizado</button><button data-g="fechar">Fechar</button></div>`;
    fundo.onclick = fecharFolhinha;
    f.onclick = (e) => {
      const g = e.target.closest("[data-g]")?.dataset.g;
      if (g === "fechar") fecharFolhinha();
      if (g === "evoluir") { reaprender(); toast("⟳ Evoluindo…"); }
      if (g === "zerar" && confirm("Apagar tudo o que o ODIN aprendeu do seu gosto (curtidas continuam nas histórias)?")) {
        genoma = null; gravar("genoma", null); sinais = {}; gravar("sinais", {}); fecharFolhinha(); paginar(); mostrar(); aviso();
      }
      if (g === "exp") {
        const termos = ints.filter((x) => x.tipo === "t").slice(0, 8);
        baixar("interesses.json", JSON.stringify({
          _doc: "Gerado pelo ✨ Seu gosto do Flip (algoritmo genético local). Copie para config/interesses.json: o motor passa a buscar estes temas no Google News, como os alertas.",
          gerado: new Date().toISOString(), aptidao: genoma.aptidao,
          topicos: termos.map((x) => ({ nome: "Interesse: " + x.valor, consulta: x.valor, idioma: /^[\x00-\x7f]+$/.test(x.valor) && !/(cao|oes|dade)$/.test(x.valor) ? "en-US" : "pt-BR",
            feed_google_alerts: "", filtro_excluir: [], peso: x.peso })),
        }, null, 2));
      }
    };
    raiz.append(fundo, f);
  }

  // ── teclado, rodinha, botões, mudança de modo ─────────────────────────────
  raiz.querySelector("[data-ant]").onclick = () => virar(-1);
  raiz.querySelector("[data-prox]").onclick = () => virar(1);
  raiz.querySelector("[data-gosto]").onclick = abrirGosto;
  palco.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); virar(1); }
    if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); virar(-1); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFolhinha(); });
  palco.addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > 30) { e.preventDefault(); virar(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
  raiz.querySelector("[data-origem]").onchange = (e) => { origem = e.target.value; gravar("flipOrigem", origem); atual = 0; paginar(); mostrar(); aviso(); toast(`⇄ ${itens.length} histórias`); };
  const trocarModo = () => {
    const v = mq.matches; if (v === vertical) return dimensionar();
    const id = grupos[atual]?.its?.[0]?.id;
    vertical = v; dimensionar(); paginar(id); mostrar();
  };
  mq.addEventListener("change", trocarModo);
  addEventListener("resize", debounce(dimensionar, 120));
  window.visualViewport?.addEventListener("resize", debounce(dimensionar, 120));
  addEventListener("odin:estado", (e) => { if (e.detail?.chave === "estante") estanteIds = naEstante(); });

  dimensionar(); paginar(); mostrar(); aviso();
  palco.focus({ preventScroll: true });
}
