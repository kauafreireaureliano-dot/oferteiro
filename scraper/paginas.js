// Visita a página de destino das ofertas mais fortes e extrai preço, título, checkout e sinais da página.
// Roda sozinho ao final do swipe.js, ou à parte: node paginas.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SOCIAL = /instagram\.com|wa\.me|whatsapp|facebook\.com|fb\.com|t\.me|youtube\.com|tiktok\.com|shopee|amazon|mercadolivre|play\.google|apps\.apple/i;
const MAX_PAGINAS = 100, SIMULTANEAS = 4, VALIDADE_DIAS = 7;

// Mesma regra de agrupamento do dashboard (src/App.jsx: chaveOferta).
function chave(destino) {
  try {
    const u = new URL(destino);
    if (SOCIAL.test(u.host)) return null;
    return u.host + u.pathname.replace(/\/$/, '');
  } catch { return null; }
}

async function lerPagina(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.route('**/*', r => ['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4500);
    const r = await page.evaluate(() => {
      const t = document.body.innerText;
      const precos = [...t.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g)]
        .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.'))).filter(v => v >= 1.5 && v <= 2000);
      const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.href);
      const co = hrefs.find(h => /monetizze|hotmart|kiwify|eduzz|pepper|perfectpay|ticto|braip|cakto|payt|yampi|lastlink|greenn|kirvano|appmax|doppus|wiapy|checkout|\/\/pay\./i.test(h));
      const nr = t.match(/(\d{2,4})\s*(?:\+\s*)?receitas/i);
      return {
        titulo: document.title.trim().slice(0, 120), precos: [...new Set(precos)].sort((a, b) => a - b).slice(0, 8),
        checkout: co ? new URL(co).host : null, nReceitas: nr ? +nr[1] : null,
        garantia: /garantia/i.test(t), bonus: /b[ôo]nus/i.test(t),
        video: !!document.querySelector('video, iframe[src*="youtube"], iframe[src*="vturb"], iframe[src*="panda"], [id*="vturb"]'),
        tamanho: t.length,
      };
    });
    return { ok: true, ...r, preco: r.precos.length ? r.precos[0] : null, urlFinal: page.url(), buscadoEm: new Date().toISOString() };
  } catch (e) {
    return { ok: false, erro: e.message.slice(0, 80), buscadoEm: new Date().toISOString() };
  } finally { await page.close(); }
}

async function rodar(arq) {
  const base = JSON.parse(fs.readFileSync(arq, 'utf8'));
  base.paginas = base.paginas || {};
  const grupos = new Map();
  for (const a of base.ads.filter(a => a.rodada === base.rodada)) {
    const k = chave(a.destino);
    if (!k) continue;
    const g = grupos.get(k) || { k, url: a.destino, n: 0, dias: 0 };
    g.n++; g.dias = Math.max(g.dias, a.dias); grupos.set(k, g);
  }
  const limite = Date.now() - VALIDADE_DIAS * 864e5;
  const fila = [...grupos.values()]
    .filter(g => g.n >= 2 && g.dias >= 14)
    .filter(g => { const p = base.paginas[g.k]; return !p || !p.ok || new Date(p.buscadoEm) < limite; })
    .sort((a, b) => (b.n * 3 + b.dias / 10) - (a.n * 3 + a.dias / 10)).slice(0, MAX_PAGINAS);
  console.log(`\nLendo ${fila.length} páginas de destino...`);
  if (!fila.length) return;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'pt-BR', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' });
  let feitas = 0;
  await Promise.all(Array.from({ length: SIMULTANEAS }, async () => {
    while (fila.length) {
      const g = fila.shift();
      base.paginas[g.k] = await lerPagina(ctx, g.url);
      if (++feitas % 10 === 0) console.log(`  ${feitas} páginas lidas`);
    }
  }));
  await browser.close();
  fs.writeFileSync(arq, JSON.stringify(base));
  const ok = Object.values(base.paginas).filter(p => p.ok);
  console.log(`Páginas: ${ok.length} lidas com sucesso, ${ok.filter(p => p.preco !== null).length} com preço identificado.`);
}

module.exports = { rodar };
if (require.main === module) rodar(path.join(__dirname, '..', 'data', 'data.json'));
