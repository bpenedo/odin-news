// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Motor de grafos (visual de estação de análise de redes): as 14 categorias são os CENTROS;
// cada notícia é um nó ligado ao seu centro; notícias que compartilham entidades/tags (POS: nomes
// próprios e substantivos) ligam-se entre si. Montado DINAMICAMENTE a partir do recorte atual
// do Portal. Layout ForceAtlas2 + Barnes-Hut em Web Worker; linha do tempo que faz o grafo
// "crescer" na ordem de publicação; exportação GEXF (abre no Gephi) e PNG.

const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
const { aplicarTema, barraConforto, carregarCss, carregarPainel, esc, fmtData, ler, toast, baixar, truncar } = await import("./comum.js" + VERSAO);

// paleta de modularidade (tons clássicos de ferramentas de redes)
const PALETA = ["#3a7bd5", "#e3534b", "#2fb36f", "#f0a830", "#9b59b6", "#16a2b8", "#e67e22", "#7f8c8d", "#d35486", "#5d9c3b", "#2c5d8f", "#c0392b", "#8e7cc3", "#1f9d8a"];
const CSS = `
.gf-app{font:12px "Segoe UI",Arial,sans-serif;display:grid;grid-template-columns:230px 1fr 230px;grid-template-rows:auto 1fr auto;min-height:80vh;border:1px solid var(--odin-borda)}
.gf-barra{grid-column:1/-1;display:flex;gap:6px;align-items:center;padding:5px 8px;background:linear-gradient(#f7f7f7,#e7e7e7);border-bottom:1px solid #c8c8c8;flex-wrap:wrap}
.odin-app[data-modo=escuro] .gf-barra{background:linear-gradient(#2b2f34,#24282c);border-color:#3a4046}
.gf-barra b{font-size:13px;margin-right:8px}.gf-barra button,.gf-barra select{font:12px Arial;border:1px solid #b9b9b9;background:var(--odin-cartao);color:var(--odin-texto);border-radius:3px;padding:3px 8px;cursor:pointer}
.gf-painel{background:var(--odin-cartao);border-right:1px solid var(--odin-borda);padding:0;overflow:auto;max-height:82vh}
.gf-painel.gf-dir{border-right:0;border-left:1px solid var(--odin-borda)}
.gf-painel h4{margin:0;padding:5px 8px;font:600 12px Arial;background:color-mix(in srgb,var(--odin-texto) 7%,transparent);border-bottom:1px solid var(--odin-borda)}
.gf-painel .gf-sec{padding:8px;border-bottom:1px solid var(--odin-borda)}
.gf-painel label{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:4px 0}
.gf-painel input[type=range]{width:100px}.gf-painel input[type=number]{width:60px}
.gf-painel .gf-run{width:100%;padding:6px;font-weight:700;border:1px solid #2e7d32;background:#43a047;color:#fff;border-radius:3px;cursor:pointer}
.gf-painel .gf-run.on{background:#c62828;border-color:#8e0000}
.gf-palco{position:relative;background:#fff;overflow:hidden;min-height:60vh}
.odin-app[data-modo=escuro] .gf-palco{background:#111}.odin-app[data-modo=cinza] .gf-palco{background:#f2f2f2}
.gf-palco canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
.gf-data{position:absolute;left:0;right:0;top:12px;text-align:center;font:700 22px Arial;color:#0005;pointer-events:none;letter-spacing:.02em}
.odin-app[data-modo=escuro] .gf-data{color:#fff6}
.gf-tip{position:absolute;pointer-events:none;background:#fffffe;border:1px solid #999;padding:6px 8px;max-width:320px;box-shadow:0 3px 10px #0003;font:12px Arial;color:#111;display:none;z-index:3}
.gf-tempo{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid var(--odin-borda);background:var(--odin-cartao)}
.gf-tempo input{flex:1}
.gf-leg{display:flex;align-items:center;gap:6px;margin:3px 0;cursor:pointer}.gf-leg i{width:11px;height:11px;border-radius:50%;flex:none;border:1px solid #0003}
.gf-top li{margin:3px 0}
@media(max-width:900px){.gf-app{grid-template-columns:1fr}.gf-painel{max-height:none;border-right:0;border-bottom:1px solid var(--odin-borda)}.gf-palco{min-height:65vh}}`;

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function montar(raiz) {
  carregarCss("/odin/temas.css");
  if (!document.getElementById("gf-css")) document.head.appendChild(Object.assign(document.createElement("style"), { id: "gf-css", textContent: CSS }));
  raiz.classList.add("odin-app", "gf-app");
  await aplicarTema(raiz);
  const p = await carregarPainel();
  const porId = new Map(p.itens.map((i) => [i.id, i]));

  raiz.innerHTML = `
    <div class="gf-barra"><b>🕸 ODIN · Grafo de notícias</b>
      <label>Recorte <select data-origem><option value="filtro">filtradas no Portal</option><option value="selecao">selecionadas</option><option value="todas">todas do dia</option></select></label>
      <label>Máx. nós <select data-max><option>500</option><option selected>1500</option><option>3000</option></select></label>
      <button data-fit>⤢ Centralizar</button><button data-png>⬇ PNG</button><button data-gexf>⬇ GEXF (Gephi)</button>
      <span data-info style="margin-left:auto;color:var(--odin-suave)"></span><span data-conf></span></div>
    <aside class="gf-painel">
      <h4>Layout — ForceAtlas 2</h4>
      <div class="gf-sec">
        <button class="gf-run" data-run>▶ Executar</button>
        <label>Escala <input type="number" step="0.5" min="0.5" value="10" data-cfg="scaling"></label>
        <label>Gravidade <input type="number" step="0.1" min="0" value="1" data-cfg="gravity"></label>
        <label>Gravidade forte <input type="checkbox" checked data-cfg="strong"></label>
        <label>Modo LinLog <input type="checkbox" data-cfg="linlog"></label>
        <label>Evitar sobreposição <input type="checkbox" data-cfg="overlap"></label>
        <label>Barnes-Hut θ <input type="number" step="0.1" min="0.3" value="1.2" data-cfg="theta"></label>
        <label>Peso das arestas <input type="number" step="0.1" min="0" value="1" data-cfg="edgeWeight"></label>
      </div>
      <h4>Aparência</h4>
      <div class="gf-sec">
        <label>Tamanho por grau <input type="checkbox" checked data-ap="grau"></label>
        <label>Rótulos dos centros <input type="checkbox" checked data-ap="rotCentro"></label>
        <label>Rótulos das notícias <input type="checkbox" data-ap="rotNoticia"></label>
        <label>Arestas notícia↔notícia <input type="checkbox" checked data-ap="arestasNN"></label>
        <label>Opacidade arestas <input type="range" min="5" max="80" value="28" data-ap="alfa"></label>
        <label>Ligar por <select data-ligar><option value="2">≥ 2 tags em comum</option><option value="1">≥ 1 tag em comum</option></select></label>
      </div>
      <h4>Partição (categorias)</h4><div class="gf-sec" data-leg></div>
    </aside>
    <div class="gf-palco"><canvas></canvas><div class="gf-data" data-data></div><div class="gf-tip"></div></div>
    <aside class="gf-painel gf-dir"><h4>Estatísticas</h4><div class="gf-sec" data-stats></div><h4>Nós de maior grau</h4><div class="gf-sec"><ol class="gf-top" data-top></ol></div>
      <h4>Nó selecionado</h4><div class="gf-sec" data-sel><small>Passe o mouse ou clique num nó.</small></div></aside>
    <div class="gf-tempo"><button data-play>▶</button><span>Linha do tempo</span><input type="range" min="0" max="1000" value="1000" data-tempo><span data-tdata></span></div>`;
  raiz.querySelector("[data-conf]").appendChild(barraConforto(raiz, () => desenhar()));
  const $ = (s) => raiz.querySelector(s);
  const cv = $("canvas"), ctx = cv.getContext("2d"), palco = $(".gf-palco"), tip = $(".gf-tip");
  $("[data-origem]").value = (ler("filtro", {}).ids || []).length ? "filtro" : "todas";
  const ap = { grau: true, rotCentro: true, rotNoticia: false, arestasNN: true, alfa: 0.28 };

  let G = null, POS = null, worker = null, rodando = false;
  let vista = { x: 0, y: 0, k: 1 }, tCorte = Infinity, hover = -1, selecionado = -1;
  // BUG-011: o ForceAtlas2 EXPANDE o grafo; enquadrar só no início deixava tudo fora da tela.
  // Auto-enquadramento enquanto o layout roda, até o usuário assumir a câmera (zoom/arrasto).
  let autoEnquadrar = true;

  // ── construção do grafo (dinâmica, a partir do recorte do Portal) ─────────
  function construir() {
    const origem = $("[data-origem]").value, max = Number($("[data-max]").value), minTags = Number($("[data-ligar]").value);
    let its = origem === "filtro" ? (ler("filtro", {}).ids || []).map((id) => porId.get(id))
      : origem === "selecao" ? ler("selecao", []).map((id) => porId.get(id)) : p.itens;
    its = its.filter(Boolean);
    if (its.length > max) {
      // BUG-024: cortar na ordem das colunas deixava só as primeiras categorias. Cota justa por
      // categoria (round-robin), cada uma pelos itens mais recentes.
      const grupos = new Map();
      for (const i of [...its].sort((a, b) => (b.data || "").localeCompare(a.data || ""))) (grupos.get(i.coluna) || grupos.set(i.coluna, []).get(i.coluna)).push(i);
      const filas = [...grupos.values()], sel = [];
      for (let k = 0; sel.length < max; k++) { let pegou = false; for (const f of filas) if (k < f.length && sel.length < max) { sel.push(f[k]); pegou = true; } if (!pegou) break; }
      its = sel;
    }
    const cats = p.categorias.filter((c) => its.some((i) => i.coluna === c.id));
    const nos = [], idx = new Map();
    cats.forEach((c, k) => { idx.set("c:" + c.id, nos.length); nos.push({ tipo: "c", id: c.id, rotulo: `${c.emoji} ${c.nome}`, cor: PALETA[p.categorias.indexOf(c) % PALETA.length], t: -Infinity }); });
    for (const i of its) { idx.set(i.id, nos.length); nos.push({ tipo: "n", id: i.id, rotulo: i.titulo, cor: PALETA[p.categorias.findIndex((c) => c.id === i.coluna) % PALETA.length], t: i.data ? Date.parse(i.data) : 0, item: i }); }
    const es = [], et = [], ew = [], tipoE = [];
    for (const i of its) { es.push(idx.get("c:" + i.coluna)); et.push(idx.get(i.id)); ew.push(1); tipoE.push(0); }
    // notícia ↔ notícia: índice invertido de tags (ignora tags genéricas: df > 40)
    const inv = new Map();
    for (const i of its) for (const t of new Set((i.tags || []).map(norm))) { if (t.length < 3) continue; (inv.get(t) || inv.set(t, []).get(t)).push(idx.get(i.id)); }
    const par = new Map();
    for (const lst of inv.values()) {
      if (lst.length < 2 || lst.length > 40) continue;
      for (let a = 0; a < lst.length; a++) for (let b = a + 1; b < lst.length; b++) {
        const k = lst[a] < lst[b] ? lst[a] * 1e6 + lst[b] : lst[b] * 1e6 + lst[a];
        par.set(k, (par.get(k) || 0) + 1);
      }
    }
    for (const [k, w] of par) if (w >= minTags) { es.push(Math.floor(k / 1e6)); et.push(k % 1e6); ew.push(w); tipoE.push(1); }
    const n = nos.length, grau = new Float64Array(n);
    for (let e = 0; e < es.length; e++) { grau[es[e]]++; grau[et[e]]++; }
    // posições iniciais: centros em círculo; notícias perto do seu centro (o grafo "explode" a partir deles)
    const x = new Float64Array(n), y = new Float64Array(n);
    const R = 60 * Math.sqrt(cats.length + 1);
    nos.forEach((no, k) => {
      if (no.tipo === "c") { const a = (2 * Math.PI * k) / cats.length; x[k] = R * Math.cos(a); y[k] = R * Math.sin(a); }
    });
    nos.forEach((no, k) => {
      if (no.tipo === "n") { const c = idx.get("c:" + no.item.coluna); x[k] = x[c] + (Math.random() - 0.5) * 40; y[k] = y[c] + (Math.random() - 0.5) * 40; }
    });
    const tam = Array.from(grau, (g, k) => (nos[k].tipo === "c" ? 10 + 2.2 * Math.sqrt(g) : 2.2 + 1.1 * Math.sqrt(g)));
    G = { nos, es, et, ew, tipoE, grau, tam, cats };
    POS = new Float32Array(n * 2); for (let k = 0; k < n; k++) { POS[2 * k] = x[k]; POS[2 * k + 1] = y[k]; }
    // vizinhança para realce
    G.viz = Array.from({ length: n }, () => []);
    for (let e = 0; e < es.length; e++) { G.viz[es[e]].push(et[e]); G.viz[et[e]].push(es[e]); }
    const ts = nos.filter((x) => x.tipo === "n" && x.t).map((x) => x.t);
    G.t0 = ts.length ? Math.min(...ts) : 0; G.t1 = ts.length ? Math.max(...ts) : 0;
    tCorte = Infinity; $("[data-tempo]").value = 1000; autoEnquadrar = true;
    if (worker) worker.terminate();
    worker = new Worker(new URL("./grafo-worker.js" + VERSAO, import.meta.url));
    worker.onmessage = (ev) => { if (ev.data.tipo === "pos") { POS = ev.data.buf; autoEnquadrar ? ajustar() : desenhar(); $("[data-info]").textContent = `${n} nós · ${es.length} arestas · iteração ${ev.data.iter}`; } };
    worker.postMessage({ tipo: "grafo", n, x: x.buffer, y: y.buffer, massa: Array.from(grau, (g) => g + 1), tam, es, et, ew }, [x.buffer, y.buffer]);
    enviarCfg();
    legenda(); estatisticas();
    ajustar();
    // BUG-025: worker NOVO precisa receber "rodar" mesmo se o estado já era "rodando"
    if (rodando) worker.postMessage({ tipo: "rodar" }); else alternar();
  }

  // ── desenho (Canvas 2D, arestas em lote por cor) ─────────────────────────
  const visivel = (k) => G.nos[k].t <= tCorte;
  const escalaVis = () => Math.min(1.6, Math.max(0.5, Math.sqrt(vista.k)));   // nós/rótulos não incham com o zoom
  function ajustar() {
    if (!POS) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < G.nos.length; k++) { const x = POS[2 * k], y = POS[2 * k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const w = palco.clientWidth, h = palco.clientHeight;
    if (!w || !h) return;
    vista.k = 0.88 * Math.min(w / (x1 - x0 || 1), h / (y1 - y0 || 1));
    vista.x = w / 2 - vista.k * (x0 + x1) / 2; vista.y = h / 2 - vista.k * (y0 + y1) / 2;
    desenhar();
  }
  let pedido = 0;
  function desenhar() {
    if (pedido) return;
    pedido = requestAnimationFrame(() => { pedido = 0; pintar(); });
  }
  function pintar() {
    if (!G || !POS) return;
    const dpr = window.devicePixelRatio || 1, w = palco.clientWidth, h = palco.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const { x: ox, y: oy, k: s } = vista;
    const foco = hover >= 0 ? hover : selecionado;
    const vizFoco = foco >= 0 ? new Set([foco, ...G.viz[foco]]) : null;
    // arestas: um path por cor (poucas trocas de estado → rápido com milhares de arestas)
    const lotes = new Map();
    for (let e = 0; e < G.es.length; e++) {
      if (G.tipoE[e] === 1 && !ap.arestasNN) continue;
      const a = G.es[e], b = G.et[e];
      if (!visivel(a) || !visivel(b)) continue;
      if (vizFoco && !(vizFoco.has(a) && vizFoco.has(b) && (a === foco || b === foco))) continue;
      const cor = G.nos[G.tipoE[e] ? a : b].cor;
      (lotes.get(cor) || lotes.set(cor, []).get(cor)).push(a, b);
    }
    ctx.lineWidth = Math.max(0.35, 0.6 * Math.sqrt(s));
    ctx.globalAlpha = vizFoco ? 0.8 : ap.alfa;
    for (const [cor, l] of lotes) {
      ctx.strokeStyle = cor; ctx.beginPath();
      for (let i = 0; i < l.length; i += 2) { ctx.moveTo(ox + s * POS[2 * l[i]], oy + s * POS[2 * l[i] + 1]); ctx.lineTo(ox + s * POS[2 * l[i + 1]], oy + s * POS[2 * l[i + 1] + 1]); }
      ctx.stroke();
    }
    // nós
    ctx.globalAlpha = 1;
    for (let k = 0; k < G.nos.length; k++) {
      if (!visivel(k)) continue;
      const r = (ap.grau ? G.tam[k] : (G.nos[k].tipo === "c" ? 12 : 3)) * escalaVis();
      const x = ox + s * POS[2 * k], y = oy + s * POS[2 * k + 1];
      if (x < -r || y < -r || x > w + r || y > h + r) continue;
      ctx.globalAlpha = vizFoco && !vizFoco.has(k) ? 0.12 : 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = G.nos[k].cor; ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = "#0006"; ctx.stroke();
    }
    // rótulos
    ctx.globalAlpha = 1; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const escuro = raiz.dataset.modo === "escuro";
    for (let k = 0; k < G.nos.length; k++) {
      if (!visivel(k)) continue;
      const no = G.nos[k], c = no.tipo === "c";
      if (!(c ? ap.rotCentro : (ap.rotNoticia || k === foco || (vizFoco && vizFoco.has(k) && s > 1.2)))) continue;
      const x = ox + s * POS[2 * k], y = oy + s * POS[2 * k + 1];
      ctx.font = c ? `bold ${Math.round(13 * Math.min(1.25, Math.max(0.85, Math.sqrt(s))))}px Arial` : "11px Arial";
      const t = c ? no.rotulo : truncar(no.rotulo, 48);
      ctx.lineWidth = 3; ctx.strokeStyle = escuro ? "#111c" : "#fffc"; ctx.strokeText(t, x, y - (c ? 0 : 10));
      ctx.fillStyle = escuro ? "#eee" : "#222"; ctx.fillText(t, x, y - (c ? 0 : 10));
    }
  }

  // ── painéis ──────────────────────────────────────────────────────────────
  function legenda() {
    $("[data-leg]").innerHTML = G.cats.map((c) => { const k = p.categorias.indexOf(c); return `<div class="gf-leg" data-cat="${esc(c.id)}"><i style="background:${PALETA[k % PALETA.length]}"></i>${esc(c.emoji)} ${esc(c.nome)}</div>`; }).join("");
  }
  function estatisticas() {
    const n = G.nos.length, m = G.es.length;
    const grauMed = (2 * m / n).toFixed(2), dens = (2 * m / (n * (n - 1) || 1)).toFixed(4);
    const nn = G.tipoE.filter((t) => t === 1).length;
    $("[data-stats]").innerHTML = `<div>Nós: <b>${n}</b> (${G.cats.length} centros)</div><div>Arestas: <b>${m}</b> (${nn} notícia↔notícia)</div>
      <div>Grau médio: <b>${grauMed}</b></div><div>Densidade: <b>${dens}</b></div>`;
    const top = [...G.nos.keys()].filter((k) => G.nos[k].tipo === "n").sort((a, b) => G.grau[b] - G.grau[a]).slice(0, 8);
    $("[data-top]").innerHTML = top.map((k) => `<li><a href="${esc(G.nos[k].item.link)}" target="_blank" rel="noopener">${esc(truncar(G.nos[k].rotulo, 60))}</a> <small>(${G.grau[k]})</small></li>`).join("");
  }
  function enviarCfg() {
    const c = {};
    raiz.querySelectorAll("[data-cfg]").forEach((el) => { c[el.dataset.cfg] = el.type === "checkbox" ? el.checked : Number(el.value); });
    worker?.postMessage({ tipo: "cfg", cfg: c });
  }
  function alternar() {
    rodando = !rodando;
    worker?.postMessage({ tipo: rodando ? "rodar" : "parar" });
    const b = $("[data-run]"); b.textContent = rodando ? "■ Parar" : "▶ Executar"; b.classList.toggle("on", rodando);
  }

  // ── interação: arrastar fundo (pan), rodinha (zoom), arrastar nó (fixa), hover/clique ──
  const tela2mundo = (mx, my) => [(mx - vista.x) / vista.k, (my - vista.y) / vista.k];
  function noEm(mx, my) {
    let melhor = -1, md = Infinity;
    for (let k = 0; k < G.nos.length; k++) {
      if (!visivel(k)) continue;
      const x = vista.x + vista.k * POS[2 * k], y = vista.y + vista.k * POS[2 * k + 1];
      const r = Math.max(5, (ap.grau ? G.tam[k] : 4) * escalaVis());
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < r * r && d < md) { md = d; melhor = k; }
    }
    return melhor;
  }
  let arrasto = null;
  cv.addEventListener("pointerdown", (e) => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = noEm(mx, my);
    arrasto = k >= 0 ? { no: k } : { pan: true, x: mx - vista.x, y: my - vista.y };
    cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing";
  });
  cv.addEventListener("pointermove", (e) => {
    if (!G) return;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (arrasto?.pan) { autoEnquadrar = false; vista.x = mx - arrasto.x; vista.y = my - arrasto.y; return desenhar(); }
    if (arrasto?.no !== undefined) { const [wx, wy] = tela2mundo(mx, my); POS[2 * arrasto.no] = wx; POS[2 * arrasto.no + 1] = wy; worker.postMessage({ tipo: "fixar", i: arrasto.no, fix: true, x: wx, y: wy }); return desenhar(); }
    const k = noEm(mx, my);
    if (k !== hover) { hover = k; desenhar(); }
    if (k >= 0) {
      const no = G.nos[k];
      tip.style.display = "block"; tip.style.left = Math.min(mx + 14, palco.clientWidth - 330) + "px"; tip.style.top = (my + 14) + "px";
      tip.innerHTML = no.tipo === "c" ? `<b>${esc(no.rotulo)}</b><br>grau ${G.grau[k]}` : `<b>${esc(no.rotulo)}</b><br><small>${esc(no.item.fonte)} · ${esc(fmtData(no.item.data))} · grau ${G.grau[k]}</small>${no.item.tags?.length ? `<br><small>${no.item.tags.map((t) => "#" + esc(t)).join(" ")}</small>` : ""}`;
    } else tip.style.display = "none";
  });
  cv.addEventListener("pointerup", (e) => {
    if (arrasto?.no !== undefined) {
      const k = arrasto.no; selecionado = k; const no = G.nos[k];
      $("[data-sel]").innerHTML = no.tipo === "c" ? `<b>${esc(no.rotulo)}</b><br>${G.grau[k]} notícias ligadas` :
        `<b>${esc(no.rotulo)}</b><br><small>${esc(no.item.fonte)} · ${esc(fmtData(no.item.data))}</small><p>${esc(truncar(no.item.resumo, 280))}</p><a href="${esc(no.item.link)}" target="_blank" rel="noopener">↗ abrir notícia</a>`;
      desenhar();
    }
    arrasto = null; cv.style.cursor = "grab";
  });
  cv.addEventListener("dblclick", (e) => { const r = cv.getBoundingClientRect(); const k = noEm(e.clientX - r.left, e.clientY - r.top); if (k >= 0) worker.postMessage({ tipo: "fixar", i: k, fix: false }); });
  cv.addEventListener("wheel", (e) => {
    e.preventDefault(); autoEnquadrar = false;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015);
    vista.x = mx - (mx - vista.x) * f; vista.y = my - (my - vista.y) * f; vista.k *= f; desenhar();
  }, { passive: false });
  cv.addEventListener("pointerleave", () => { hover = -1; tip.style.display = "none"; desenhar(); });
  new ResizeObserver(() => desenhar()).observe(palco);

  // ── controles ────────────────────────────────────────────────────────────
  $("[data-run]").onclick = alternar;
  raiz.querySelectorAll("[data-cfg]").forEach((el) => el.addEventListener("change", enviarCfg));
  raiz.querySelectorAll("[data-ap]").forEach((el) => el.addEventListener("input", () => { ap[el.dataset.ap] = el.type === "checkbox" ? el.checked : Number(el.value) / 100; desenhar(); }));
  $("[data-origem]").onchange = construir; $("[data-max]").onchange = construir; $("[data-ligar]").onchange = construir;
  $("[data-fit]").onclick = () => { autoEnquadrar = true; ajustar(); };
  $("[data-leg]").addEventListener("click", (e) => { const l = e.target.closest("[data-cat]"); if (!l) return; const k = G.nos.findIndex((n) => n.tipo === "c" && n.id === l.dataset.cat); selecionado = selecionado === k ? -1 : k; desenhar(); });
  const fmtT = (t) => (isFinite(t) ? new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }) : "");
  const aplicarTempo = (v) => {
    tCorte = v >= 1000 ? Infinity : G.t0 + (G.t1 - G.t0) * (v / 1000);
    $("[data-data]").textContent = isFinite(tCorte) ? fmtT(tCorte) + " — horário local" : "";
    $("[data-tdata]").textContent = isFinite(tCorte) ? fmtT(tCorte) : "todas";
    desenhar();
  };
  $("[data-tempo]").oninput = (e) => aplicarTempo(Number(e.target.value));
  let anim = 0;
  $("[data-play]").onclick = (e) => {
    if (anim) { cancelAnimationFrame(anim); anim = 0; e.target.textContent = "▶"; return; }
    e.target.textContent = "⏸"; let v = 0; const t0 = performance.now();
    const passo = (t) => { v = Math.min(1000, ((t - t0) / 20000) * 1000); $("[data-tempo]").value = v; aplicarTempo(v); if (v < 1000) anim = requestAnimationFrame(passo); else { anim = 0; e.target.textContent = "▶"; } };
    anim = requestAnimationFrame(passo);
  };
  $("[data-png]").onclick = () => cv.toBlob((b) => { const u = URL.createObjectURL(b); Object.assign(document.createElement("a"), { href: u, download: `grafo-odin-${p.dia}.png` }).click(); setTimeout(() => URL.revokeObjectURL(u), 1000); });
  $("[data-gexf]").onclick = () => {
    const hex = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
    const nosX = G.nos.map((no, k) => { const [r, g, b] = hex(no.cor); return `<node id="${k}" label="${esc(no.tipo === "c" ? no.rotulo : truncar(no.rotulo, 120))}"><attvalues><attvalue for="0" value="${no.tipo === "c" ? "categoria" : "notícia"}"/><attvalue for="1" value="${esc(no.tipo === "c" ? no.id : no.item.coluna)}"/></attvalues><viz:color r="${r}" g="${g}" b="${b}"/><viz:position x="${POS[2 * k].toFixed(2)}" y="${(-POS[2 * k + 1]).toFixed(2)}" z="0"/><viz:size value="${G.tam[k].toFixed(2)}"/></node>`; }).join("");
    const arX = G.es.map((a, e) => `<edge id="${e}" source="${a}" target="${G.et[e]}" weight="${G.ew[e]}"/>`).join("");
    baixar(`grafo-odin-${p.dia}.gexf`, `<?xml version="1.0" encoding="UTF-8"?>\n<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3"><meta><creator>ODIN — ProfBru © 2026</creator><description>Grafo de notícias ${p.dia}</description></meta><graph defaultedgetype="undirected"><attributes class="node"><attribute id="0" title="tipo" type="string"/><attribute id="1" title="categoria" type="string"/></attributes><nodes>${nosX}</nodes><edges>${arX}</edges></graph></gexf>`, "application/xml");
    toast("⬇ GEXF exportado — abra no Gephi");
  };
  construir();
}
