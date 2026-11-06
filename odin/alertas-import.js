// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Importação EM LOTE de termos de alerta a partir de arquivo — tudo no navegador, sem servidor,
// sem biblioteca externa:
//   • .txt  — uma frase por linha (ENTER); linhas vazias e começadas por # são ignoradas
//   • .csv  — separador detectado (; , TAB), aspas RFC 4180
//   • .xlsx — ZIP + SpreadsheetML (descompressão nativa: DecompressionStream "deflate-raw")
//   • .xls  — Excel 97-2003 (BIFF8 dentro de OLE/CFB); também aceita ".xls" que na verdade é
//             HTML ou XML Spreadsheet 2003 (exportação comum de sistemas)
// O FORMATO é reconhecido pelos bytes iniciais, não pela extensão.
// Planilhas: 1ª aba; usa a coluna cujo cabeçalho é termo/alerta/frase/palavra/keyword/consulta,
// senão a 1ª coluna. Charset do texto: BOM UTF-8/UTF-16, senão UTF-8 estrito, senão Windows-1252.

export const LIMITE_BYTES = 20 * 1024 * 1024;
export const LIMITE_TERMOS = 10000;
const MAX_CHARS = 200;
const CABECALHO = /^(termos?|alertas?|frases?|palavras?(-chave)?|keywords?|terms?|consultas?|query|queries)$/;

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// ── texto ────────────────────────────────────────────────────────────────────
export function decodificar(u8) {
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder("utf-8").decode(u8.subarray(3));
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); }
  catch { return new TextDecoder("windows-1252").decode(u8); }   // Bloco de Notas / Excel antigo em PT-BR
}

export function linhasTxt(txt) {
  return txt.split(/\r\n|\r|\n/).map((l) => [l]);
}

export function linhasCsv(txt) {
  const amostra = txt.split(/\r\n|\r|\n/, 5).join("\n");
  const sep = [";", ",", "\t"].map((s) => [s, amostra.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = []; let lin = [], campo = "", aspas = false;
  for (let k = 0; k < txt.length; k++) {
    const c = txt[k];
    if (aspas) {
      if (c === '"') { if (txt[k + 1] === '"') { campo += '"'; k++; } else aspas = false; }
      else campo += c;
    } else if (c === '"' && campo === "") aspas = true;
    else if (c === sep) { lin.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[k + 1] === "\n") k++;
      lin.push(campo); linhas.push(lin); lin = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || lin.length) { lin.push(campo); linhas.push(lin); }
  return linhas;
}

// ── XML (SpreadsheetML / sharedStrings / HTML) por regex: leve e igual no Node e no navegador ──
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const desentidade = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
const semTags = (s) => desentidade(s.replace(/<[^>]*>/g, ""));

function colunaDeRef(ref) {           // "C12" → 2
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ── ZIP (.xlsx) ──────────────────────────────────────────────────────────────
async function inflar(dados) {
  const ds = new DecompressionStream("deflate-raw");
  const buf = await new Response(new Blob([dados]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

async function lerZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let k = u8.length - 22; k >= Math.max(0, u8.length - 65557); k--) if (dv.getUint32(k, true) === 0x06054b50) { eocd = k; break; }
  if (eocd < 0) throw new Error("ZIP sem diretório central");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const arquivos = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP corrompido");
    const metodo = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + ln));
    arquivos.set(nome, { metodo, comp, local });
    p += 46 + ln + le + lc;
  }
  return async (nome) => {
    const a = arquivos.get(nome); if (!a) return null;
    const ini = a.local + 30 + dv.getUint16(a.local + 26, true) + dv.getUint16(a.local + 28, true);
    const bruto = u8.subarray(ini, ini + a.comp);
    const dados = a.metodo === 0 ? bruto : a.metodo === 8 ? await inflar(bruto) : null;
    if (!dados) throw new Error(`ZIP: método ${a.metodo} não suportado`);
    return new TextDecoder("utf-8").decode(dados);
  };
}

export async function linhasXlsx(u8) {
  const abrir = await lerZip(u8);
  const sst = [];
  const ss = await abrir("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    sst.push([...m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desentidade(t[1])).join(""));
  }
  // 1ª aba DE FATO (ordem do workbook), não necessariamente sheet1.xml
  let alvo = "xl/worksheets/sheet1.xml";
  const wb = await abrir("xl/workbook.xml"), rels = await abrir("xl/_rels/workbook.xml.rels");
  const rid = wb && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  const rel = rid && rels && new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(rels)?.[0];
  const destino = rel && /Target="([^"]+)"/.exec(rel)?.[1];
  if (destino) alvo = destino.startsWith("/") ? destino.slice(1) : "xl/" + destino.replace(/^\.\//, "");
  const folha = await abrir(alvo);
  if (!folha) throw new Error("planilha sem aba legível");
  const linhas = [];
  for (const r of folha.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const lin = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = c[1], corpo = c[2] || "";
      const ref = /\br="([A-Z]+\d+)"/.exec(at)?.[1];
      const t = /\bt="(\w+)"/.exec(at)?.[1] || "n";
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let val = "";
      if (t === "s") val = sst[+v] ?? "";
      else if (t === "inlineStr") val = [...corpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => desentidade(x[1])).join("");
      else if (v !== undefined) val = desentidade(v);
      lin[ref ? colunaDeRef(ref) : lin.length] = val;
    }
    linhas.push(Array.from(lin, (x) => x ?? ""));
  }
  return linhas;
}

// ── OLE/CFB + BIFF8 (.xls Excel 97-2003) ─────────────────────────────────────
function lerCfb(u8, nomes) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
  const sec = (s) => 512 + s * ss;                       // cabeçalho ocupa o setor -1 (512 B na v3)
  const corte = dv.getUint32(56, true);
  const difat = [];
  for (let k = 0; k < 109; k++) difat.push(dv.getInt32(76 + k * 4, true));
  for (let s = dv.getInt32(68, true), n = dv.getUint32(72, true); s >= 0 && n-- > 0;) {
    for (let k = 0; k < ss / 4 - 1; k++) difat.push(dv.getInt32(sec(s) + k * 4, true));
    s = dv.getInt32(sec(s) + ss - 4, true);
  }
  const fat = [];
  for (const s of difat.slice(0, dv.getUint32(44, true))) if (s >= 0) for (let k = 0; k < ss / 4; k++) fat.push(dv.getInt32(sec(s) + k * 4, true));
  const cadeia = (s, tab) => { const r = []; while (s >= 0 && r.length <= tab.length) { r.push(s); s = tab[s]; } return r; };
  const ler = (s) => { const c = cadeia(s, fat), out = new Uint8Array(c.length * ss); c.forEach((x, k) => out.set(u8.subarray(sec(x), sec(x) + ss), k * ss)); return out; };
  const dir = ler(dv.getInt32(48, true)), dd = new DataView(dir.buffer);
  const ents = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const ln = dd.getUint16(o + 64, true);
    const nome = ln > 2 ? new TextDecoder("utf-16le").decode(dir.subarray(o, o + ln - 2)) : "";
    ents.push({ nome, tipo: dir[o + 66], ini: dd.getInt32(o + 116, true), tam: dd.getUint32(o + 120, true) });
  }
  const e = ents.find((x) => x.tipo === 2 && nomes.includes(x.nome));
  if (!e) throw new Error("arquivo OLE sem planilha Excel (Workbook)");
  if (e.tam >= corte) return ler(e.ini).subarray(0, e.tam);
  // fluxo pequeno: mora no mini-stream da entrada raiz
  const mini = ler(ents[0].ini), mfat = [];
  const mf = ler(dv.getInt32(60, true)), mdv = new DataView(mf.buffer);
  if (dv.getUint32(64, true)) for (let k = 0; k < mf.length / 4; k++) mfat.push(mdv.getInt32(k * 4, true));
  const c = cadeia(e.ini, mfat), out = new Uint8Array(c.length * mss);
  c.forEach((x, k) => out.set(mini.subarray(x * mss, (x + 1) * mss), k * mss));
  return out.subarray(0, e.tam);
}

export function linhasXls(u8) {
  const wb = lerCfb(u8, ["Workbook", "Book"]);
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const recs = [];
  for (let p = 0; p + 4 <= wb.length;) {
    const tipo = dv.getUint16(p, true), len = dv.getUint16(p + 2, true);
    recs.push({ tipo, ini: p + 4, len }); p += 4 + len;
  }
  // SST pode ser fatiada em registros CONTINUE (0x3C); uma string cortada no meio recomeça com novo byte de flags
  const sst = [];
  const iSst = recs.findIndex((r) => r.tipo === 0x00fc);
  if (iSst >= 0) {
    const segs = [recs[iSst]];
    for (let k = iSst + 1; k < recs.length && recs[k].tipo === 0x003c; k++) segs.push(recs[k]);
    let si = 0, p = segs[0].ini + 8;
    const fim = () => segs[si].ini + segs[si].len;
    const avancar = () => { if (p >= fim() && si + 1 < segs.length) { si++; p = segs[si].ini; } };
    const u8b = () => { avancar(); return wb[p++]; };
    const u16 = () => { avancar(); const v = dv.getUint16(p, true); p += 2; return v; };
    const u32 = () => { avancar(); const v = dv.getUint32(p, true); p += 4; return v; };
    const pular = (n) => { while (n > 0) { avancar(); const d = Math.min(n, fim() - p); p += d; n -= d; } };
    const unicos = dv.getUint32(segs[0].ini + 4, true);
    for (let k = 0; k < unicos && si < segs.length; k++) {
      const cch = u16(); let fl = u8b();
      const runs = fl & 8 ? u16() : 0, ext = fl & 4 ? u32() : 0;
      let s = "", falta = cch;
      while (falta > 0) {
        if (p >= fim()) { if (si + 1 >= segs.length) break; si++; p = segs[si].ini; fl = wb[p++]; }
        const largo = fl & 1, cabe = Math.min(falta, Math.floor((fim() - p) / (largo ? 2 : 1)));
        s += largo ? new TextDecoder("utf-16le").decode(wb.subarray(p, p + cabe * 2)) : new TextDecoder("windows-1252").decode(wb.subarray(p, p + cabe));
        p += cabe * (largo ? 2 : 1); falta -= cabe;
      }
      pular(runs * 4 + ext);
      sst.push(s);
    }
  }
  // 1ª planilha (BOF tipo 0x10) até o seu EOF
  const linhas = [];
  const por = (r, c, v) => { (linhas[r] ||= [])[c] = v; };
  const rk = (v) => { let n = v & 2 ? (v >> 2) : new DataView(new Uint32Array([0, v & 0xfffffffc]).buffer).getFloat64(0, true); if (v & 1) n /= 100; return String(n); };
  let dentro = false;
  for (const r of recs) {
    if (r.tipo === 0x0809) { if (dentro) break; dentro = dv.getUint16(r.ini + 2, true) === 0x10; continue; }
    if (!dentro) continue;
    if (r.tipo === 0x000a) break;
    const lin = () => dv.getUint16(r.ini, true), col = () => dv.getUint16(r.ini + 2, true);
    if (r.tipo === 0x00fd) por(lin(), col(), sst[dv.getUint32(r.ini + 6, true)] ?? "");
    else if (r.tipo === 0x0204) {                                    // LABEL (texto inline)
      const cch = dv.getUint16(r.ini + 6, true), fl = wb[r.ini + 8], q = r.ini + 9;
      por(lin(), col(), fl & 1 ? new TextDecoder("utf-16le").decode(wb.subarray(q, q + cch * 2)) : new TextDecoder("windows-1252").decode(wb.subarray(q, q + cch)));
    } else if (r.tipo === 0x0203) por(lin(), col(), String(dv.getFloat64(r.ini + 6, true)));
    else if (r.tipo === 0x027e) por(lin(), col(), rk(dv.getUint32(r.ini + 6, true)));
    else if (r.tipo === 0x00bd) {                                    // MULRK
      const n = (r.len - 6) / 6;
      for (let k = 0; k < n; k++) por(lin(), col() + k, rk(dv.getUint32(r.ini + 4 + k * 6 + 2, true)));
    }
  }
  return Array.from(linhas, (l) => Array.from(l || [], (x) => x ?? ""));
}

function linhasHtmlOuXml(txt) {
  const linhas = [];
  const blocoLinha = /<Row\b/.test(txt) ? /<Row\b[^>]*>([\s\S]*?)<\/Row>/g : /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const blocoCel = /<Row\b/.test(txt) ? /<Data\b[^>]*>([\s\S]*?)<\/Data>/g : /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  for (const r of txt.matchAll(blocoLinha)) linhas.push([...r[1].matchAll(blocoCel)].map((c) => semTags(c[1])));
  return linhas;
}

// ── seleção da coluna + limpeza ──────────────────────────────────────────────
export function termosDeLinhas(linhas) {
  let col = 0, ini = 0;
  const cab = (linhas[0] || []).map((c) => norm(c));
  const k = cab.findIndex((c) => CABECALHO.test(c));
  if (k >= 0) { col = k; ini = 1; }
  const vistos = new Set(), termos = [];
  let ignorados = 0;
  for (const l of linhas.slice(ini)) {
    let t = String(l[col] ?? "").replace(/[\u0000-\u001f\u007f​﻿]/g, " ").replace(/\s+/g, " ").trim();
    t = t.replace(/^["'“”«»]+|["'“”«»]+$/g, "").trim();
    if (!t || t.startsWith("#")) continue;
    if (t.length > MAX_CHARS) { ignorados++; continue; }
    const n = norm(t);
    if (vistos.has(n)) { ignorados++; continue; }
    vistos.add(n); termos.push(t);
    if (termos.length >= LIMITE_TERMOS) break;
  }
  return { termos, ignorados, coluna: col, cabecalho: ini === 1 };
}

// ── ponto de entrada ─────────────────────────────────────────────────────────
export async function termosDeBytes(u8, nome = "") {
  if (u8.length > LIMITE_BYTES) throw new Error(`arquivo maior que ${LIMITE_BYTES / 1048576} MB`);
  let formato, linhas;
  if (u8[0] === 0x50 && u8[1] === 0x4b) { formato = "xlsx"; linhas = await linhasXlsx(u8); }
  else if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) { formato = "xls"; linhas = linhasXls(u8); }
  else {
    const txt = decodificar(u8);
    const cabeca = txt.slice(0, 2048).trimStart().toLowerCase();
    if (cabeca.startsWith("<") && /<(table|tr|workbook|\?xml|html)/.test(cabeca)) { formato = "xls-html"; linhas = linhasHtmlOuXml(txt); }
    else if (/\.(csv|tsv)$/i.test(nome)) { formato = "csv"; linhas = linhasCsv(txt); }
    else { formato = "txt"; linhas = linhasTxt(txt); }
  }
  return { formato, ...termosDeLinhas(linhas) };
}

export async function termosDeArquivo(arquivo) {
  return termosDeBytes(new Uint8Array(await arquivo.arrayBuffer()), arquivo.name);
}
