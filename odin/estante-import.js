// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Importação da Estante: aceita o backup do próprio ODIN e as exportações do Pocket
// (JSON part_*.json {title,url,time_added,tags,status}, JSON da API {list:{…}}, CSV e ril_export.html).
// Tudo no navegador; nenhuma biblioteca. Itens do Pocket entram em Favoritos (pedido do usuário) e com a tag "pocket".

const LIMITE = 50000;

// id estável a partir da URL (FNV-1a 32 bits + tamanho): reimportar o mesmo arquivo não duplica
export function idDeUrl(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) { h ^= url.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "p" + (h >>> 0).toString(36) + url.length.toString(36);
}

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const tagsDe = (t) => (Array.isArray(t) ? t : typeof t === "object" && t ? Object.keys(t) : String(t || "").split(/[|,]/))
  .map((s) => String(s).trim()).filter(Boolean);
const dataDe = (t) => {
  const n = Number(t);
  if (Number.isFinite(n) && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  const d = new Date(t || Date.now());
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
};

// item do Pocket (qualquer exportação) → item da Estante; enxuto (sem campos vazios) para caber no localStorage
export function dePocket(p) {
  const url = String(p.url || p.given_url || p.resolved_url || p.href || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const tit = String(p.title || p.resolved_title || p.given_title || "").trim();
  const tags = [...new Set([...tagsDe(p.tags), "pocket"])];
  const x = { id: idDeUrl(url), url, titulo: tit || host(url) || url, fonte: host(url), tags, salvo: dataDe(p.time_added), favorito: true };
  if (String(p.status) === "archive" || String(p.status) === "1") x.arquivado = true;
  if (p.excerpt) x.resumo = String(p.excerpt);
  return x;
}

// CSV com cabeçalho (exportação nova do Pocket: title,url,time_added,cursor,tags,status), com aspas RFC 4180
export function linhasCsv(txt) {
  const linhas = []; let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const cab = (linhas.shift() || []).map((s) => s.trim().toLowerCase());
  return linhas.filter((l) => l.some((s) => s.trim())).map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ""])));
}

// ril_export.html do Pocket antigo: <h1>Unread</h1><ul><li><a href time_added tags>título</a></li>… <h1>Read Archive</h1>
export function linhasHtml(txt) {
  const doc = new DOMParser().parseFromString(txt, "text/html");
  return [...doc.querySelectorAll("a[href]")].map((a) => {
    let h = a.closest("ul")?.previousElementSibling;
    while (h && !/^H\d$/.test(h.tagName)) h = h.previousElementSibling;
    return { url: a.getAttribute("href"), title: a.textContent, time_added: a.getAttribute("time_added"),
      tags: a.getAttribute("tags"), status: /archive|read/i.test(h?.textContent || "") && !/unread/i.test(h?.textContent || "") ? "archive" : "unread" };
  });
}

// texto do arquivo → { itens, formato }
export function itensDeTexto(txt, nome = "") {
  txt = txt.replace(/^﻿/, "");
  const ext = (nome.split(".").pop() || "").toLowerCase();
  let brutos, formato;
  if (ext === "csv") { brutos = linhasCsv(txt); formato = "Pocket CSV"; }
  else if (ext === "html" || ext === "htm" || /^\s*<(!doctype|html)/i.test(txt)) { brutos = linhasHtml(txt); formato = "Pocket HTML"; }
  else {
    const j = JSON.parse(txt);
    const lista = Array.isArray(j) ? j : j && typeof j.list === "object" ? Object.values(j.list) : Array.isArray(j?.items) ? j.items : null;
    if (!lista) throw new Error("formato JSON desconhecido");
    // backup do próprio ODIN: já tem id e titulo
    if (lista.length && lista.every((x) => x && x.id && (x.titulo !== undefined || x.salvo))) return { itens: lista.slice(0, LIMITE), formato: "ODIN" };
    brutos = lista; formato = Array.isArray(j) ? "Pocket JSON" : "Pocket API";
  }
  return { itens: brutos.slice(0, LIMITE).map(dePocket).filter(Boolean), formato };
}

// junta sem duplicar (mesmo id OU mesma URL); devolve a nova estante e quantos entraram
export function mesclar(est, novos) {
  const ids = new Set(est.map((x) => x.id)), urls = new Set(est.map((x) => x.url));
  const add = [];
  for (const x of novos) {
    if (ids.has(x.id) || urls.has(x.url)) continue;
    ids.add(x.id); urls.add(x.url); add.push(x);
  }
  return { est: [...add, ...est], novos: add.length, repetidos: novos.length - add.length };
}
