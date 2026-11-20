// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Jornal Diário — Primeira Página com a manchete de cada coluna (categoria), resumo extrativo,
// tags POS e a manchete geral etiquetada palavra a palavra. Se o usuário montou uma edição
// EXCLUSIVA no Portal, um botão alterna para ela.

const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
const { aplicarTema, barraConforto, carregarCss, carregarPainel, jornalHTML, JORNAL_CSS, ler, abrirDocumento, baixar, esc } = await import("./comum.js" + VERSAO);

export async function montar(raiz) {
  carregarCss("/odin/temas.css");
  raiz.classList.add("odin-app");
  if (!document.getElementById("odin-jornal-css")) {
    document.head.appendChild(Object.assign(document.createElement("style"), { id: "odin-jornal-css", textContent: JORNAL_CSS }));
  }
  await aplicarTema(raiz);
  const p = await carregarPainel();
  const ordem = ler("ordemCats", []);
  const pos = (id) => { const k = ordem.indexOf(id); return k < 0 ? 1e6 + p.categorias.findIndex((c) => c.id === id) : k; };

  const edicao = (exclusivo) => {
    let colunas = p.categorias.map((c) => ({ ...c, manchetes: p.manchetes[c.id] || [] })).sort((a, b) => pos(a.id) - pos(b.id));
    let manchete = p.manchete;
    if (exclusivo) {
      const ids = new Set(ler("jornalExclusivo", {}).ids || []);
      const porId = new Map(p.itens.map((i) => [i.id, i]));
      colunas = colunas.map((c) => ({ ...c, manchetes: [...ids].map((id) => porId.get(id)).filter((i) => i && i.coluna === c.id).map((i) => ({ ...i, nFontes: 1 })) }))
        .filter((c) => c.manchetes.length);
      const m0 = colunas[0]?.manchetes[0];
      manchete = m0 && { titulo: m0.titulo, link: m0.link, fonte: m0.fonte, resumo: m0.resumo, n_fontes: 1 };
    }
    return jornalHTML({ dia: p.dia, manchete, colunas, exclusivo,
      subtitulo: exclusivo ? "Edição exclusiva — só as notícias que você escolheu no Portal" : undefined });
  };

  const temExclusivo = (ler("jornalExclusivo", {}).ids || []).length > 0;
  let exclusivo = false;
  raiz.innerHTML = `<div class="odin-nao-imprimir" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;padding:6px 10px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button data-imp class="odin-btn-j">🖨 Imprimir / PDF</button>
        <button data-html class="odin-btn-j">⬇ Baixar HTML</button>
        ${temExclusivo ? `<button data-exc class="odin-btn-j" aria-pressed="false">📰 Minha edição exclusiva</button>` : ""}
      </div><div data-conf></div></div><div data-jornal></div>`;
  raiz.querySelector("[data-conf]").appendChild(barraConforto(raiz));
  const alvo = raiz.querySelector("[data-jornal]");
  const desenhar = () => { alvo.innerHTML = edicao(exclusivo); };
  desenhar();
  raiz.querySelectorAll(".odin-btn-j").forEach((b) => Object.assign(b.style, { font: "12px Arial", padding: "4px 10px", border: "1px solid var(--odin-borda)", background: "var(--odin-cartao)", color: "var(--odin-texto)", borderRadius: "4px", cursor: "pointer" }));
  raiz.querySelector("[data-imp]").onclick = () => abrirDocumento("O Diário ODIN — " + p.dia, edicao(exclusivo), JORNAL_CSS);
  raiz.querySelector("[data-html]").onclick = () => baixar(`jornal-odin-${p.dia}${exclusivo ? "-exclusivo" : ""}.html`,
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O Diário ODIN — ${esc(p.dia)}</title><style>${JORNAL_CSS}</style></head><body>${edicao(exclusivo)}</body></html>`, "text/html");
  const be = raiz.querySelector("[data-exc]");
  if (be) be.onclick = () => { exclusivo = !exclusivo; be.setAttribute("aria-pressed", exclusivo); be.textContent = exclusivo ? "📰 Edição do dia" : "📰 Minha edição exclusiva"; desenhar(); };
}
