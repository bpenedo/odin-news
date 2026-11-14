// ODIN — On Demand Information and News
// Autor: ProfBru - Bruno Penedo © 2026 - TODOS OS DIREITOS RESERVADOS
// E-mail: profbruanbima@gmail.com
//
// Web Worker do algoritmo genético: a evolução roda fora da thread da interface (virada de página a 60 fps).
const VERSAO = new URL(import.meta.url).search;   // "?v=<hash>": módulos irmãos vêm na MESMA versão (sem cache velho)
// o tratador é registrado JÁ (antes do import): mensagem que chega durante o carregamento não se perde
const modulo = import("./genetico.js" + VERSAO);

self.onmessage = async (e) => {
  const { evoluir } = await modulo;
  const { exemplos, colunas, semente, opcoes } = e.data;
  try { self.postMessage({ ok: true, genoma: evoluir(exemplos, colunas, { ...opcoes, semente }) }); }
  catch (err) { self.postMessage({ ok: false, erro: String(err && err.message || err) }); }
};
