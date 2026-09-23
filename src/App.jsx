import { useEffect, useMemo, useState } from 'react';

const SOCIAL = /instagram\.com|wa\.me|whatsapp|facebook\.com|fb\.com|t\.me|youtube\.com|tiktok\.com/i;
const CHECKOUT = /monetizze|hotmart|kiwify|eduzz|pepper|perfectpay|ticto|braip|cakto|payt|yampi|lastlink|greenn|kirvano|appmax|doppus|clickbank|go\.hotmart/i;

function tipoDestino(d) {
  if (!d) return 'sem link';
  if (CHECKOUT.test(d)) return 'checkout';
  if (/wa\.me|whatsapp/i.test(d)) return 'whatsapp';
  if (/instagram\.com/i.test(d)) return 'instagram';
  if (/shopee|amazon|mercadolivre|magalu|aliexpress/i.test(d)) return 'marketplace';
  return 'site/funil';
}

function chaveOferta(a) {
  try {
    const u = new URL(a.destino);
    if (!SOCIAL.test(u.host) && !/shopee|amazon|mercadolivre/i.test(u.host)) return u.host + u.pathname.replace(/\/$/, '');
  } catch {}
  return 'anunciante:' + (a.anunciante || a.id);
}

const NICHO = /receita|recheio|bolo|doce|sobremesa|marmita|air ?fryer|culin|cozinh|confeit|brigadeiro|salgad|panifica|\bfit\b|low ?carb/i;

function brl(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }

// Nota 0-100 de "vale modelar": prova de escala (tempo + volume) + página de ticket baixo + funil de venda + nicho.
function avaliarModelagem(g, pagina) {
  const motivos = [];
  let nota = Math.min(g.dias, 180) / 180 * 35 + Math.min(g.ativos, 20) / 20 * 30;
  if (g.dias >= 60) motivos.push(g.dias + ' dias no ar');
  if (g.ativos >= 5) motivos.push(g.ativos + ' anúncios ativos');
  const precos = ((pagina && pagina.precos) || []).filter(v => v >= 1.5);
  const preco = precos.length ? precos[0] : null;
  if (preco === null) nota += 6;
  else if (preco <= 10) { nota += 20; motivos.push('ticket baixo ' + brl(preco)); }
  else if (preco <= 20) { nota += 14; motivos.push('ticket ' + brl(preco)); }
  else if (preco <= 40) nota += 6;
  if (pagina && pagina.checkout) { nota += 8; motivos.push('checkout ' + pagina.checkout.replace(/^(www|pay|checkout)\./, '')); }
  if (NICHO.test(g.anunciante + ' ' + g.copy + ' ' + ((pagina && pagina.titulo) || ''))) nota += 7;
  return { nota: Math.round(nota), motivos, preco };
}

function agrupar(ads, por, paginas) {
  const m = new Map();
  for (const a of ads) {
    const k = por === 'anunciante' ? 'anunciante:' + (a.anunciante || a.id) : chaveOferta(a);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
  }
  return [...m.entries()].map(([k, lista]) => {
    lista.sort((x, y) => y.dias - x.dias);
    const maisAntigo = lista[0];
    const dest = lista.find(a => a.destino)?.destino || '';
    const g = {
      k, lista, ativos: lista.length, dias: maisAntigo.dias,
      anunciante: maisAntigo.anunciante || '(sem nome)',
      copy: lista.find(a => a.copy)?.copy || '',
      destino: dest, tipo: tipoDestino(dest),
      nova: lista.some(a => a.nova),
      score: Math.min(maisAntigo.dias, 365) + Math.min(lista.length, 60) * 6,
    };
    g.pagina = lista.map(chaveOferta).map(k => paginas[k]).find(p => p && p.ok) || null;
    Object.assign(g, avaliarModelagem(g, g.pagina));
    return g;
  });
}

// Texto pronto para colar no Claude e pedir a versão original da oferta (página + upsell) no seu funil.
function briefing(g) {
  const p = g.pagina || {};
  return [
    'OFERTA PARA MODELAR (usar como referência de ângulo e estrutura; escrever tudo original)',
    'Anunciante: ' + g.anunciante,
    'Prova de escala: ' + g.ativos + ' anúncios ativos, ' + g.dias + ' dias no ar (nota ' + g.nota + '/100)',
    'Página: ' + (p.urlFinal || g.destino || '-'),
    'Título da página: ' + (p.titulo || '-'),
    'Preço detectado: ' + (g.preco !== null ? brl(g.preco) : 'não identificado') + (p.precos && p.precos.length > 1 ? ' (outros valores na página: ' + p.precos.slice(1).map(brl).join(', ') + ')' : ''),
    'Checkout: ' + (p.checkout || '-'),
    'Nº de receitas prometido: ' + (p.nReceitas || '-'),
    'Tem garantia: ' + (p.garantia ? 'sim' : 'não') + ' | bônus: ' + (p.bonus ? 'sim' : 'não') + ' | vídeo: ' + (p.video ? 'sim' : 'não'),
    'Copy dos anúncios: ' + (g.copy || '-'),
    'Criativos (Biblioteca): ' + g.lista.slice(0, 3).map(a => a.link).join(' , '),
  ].join('\n');
}

const ORDENS = {
  modelar: ['Melhores para modelar', (a, b) => b.nota - a.nota || b.dias - a.dias],
  score: ['Melhor score', (a, b) => b.score - a.score],
  ativos: ['Mais anúncios ativos', (a, b) => b.ativos - a.ativos || b.dias - a.dias],
  dias: ['Mais tempo no ar', (a, b) => b.dias - a.dias || b.ativos - a.ativos],
};

function useFavoritos() {
  const [fav, setFav] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('oferteiro-fav') || '[]')); } catch { return new Set(); }
  });
  const toggle = k => setFav(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k);
    try { localStorage.setItem('oferteiro-fav', JSON.stringify([...n])); } catch {}
    return n;
  });
  return [fav, toggle];
}

export default function App() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);
  const [logado, setLogado] = useState(null);
  const [busca, setBusca] = useState('');
  const [minDias, setMinDias] = useState(30);
  const [minAtivos, setMinAtivos] = useState(2);
  const [tipo, setTipo] = useState('todos');
  const [ordem, setOrdem] = useState('modelar');
  const [soTicket, setSoTicket] = useState(false);
  const [por, setPor] = useState('oferta');
  const [soNovas, setSoNovas] = useState(false);
  const [soFav, setSoFav] = useState(false);
  const [aberto, setAberto] = useState(null);
  const [fav, toggleFav] = useFavoritos();
  const [copiado, setCopiado] = useState(null);
  const copiarBriefing = g => {
    navigator.clipboard.writeText(briefing(g)).then(() => { setCopiado(g.k); setTimeout(() => setCopiado(null), 2000); });
  };

  const carregar = () => {
    fetch('/api/data').then(r => {
      if (r.status === 401) { setLogado(false); return null; }
      if (!r.ok) throw new Error();
      return r.json();
    }).then(d => { if (d) { setDados(d); setLogado(true); } }).catch(() => setErro(true));
  };
  useEffect(carregar, []);
  const sair = () => fetch('/api/logout', { method: 'POST' }).then(() => { setDados(null); setLogado(false); });

  const grupos = useMemo(() => {
    if (!dados) return [];
    const ativos = dados.ads
      .filter(a => a.rodada === dados.rodada)
      .map(a => ({ ...a, nova: a.rodadaNova === dados.rodada && dados.rodada > 1 }));
    return agrupar(ativos, por, dados.paginas || {});
  }, [dados, por]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return grupos
      .filter(g => g.dias >= minDias && g.ativos >= minAtivos)
      .filter(g => tipo === 'todos' || g.tipo === tipo)
      .filter(g => !soNovas || g.nova)
      .filter(g => !soTicket || (g.preco !== null && g.preco <= 20))
      .filter(g => !soFav || fav.has(g.k))
      .filter(g => !q || (g.anunciante + ' ' + g.copy + ' ' + g.destino).toLowerCase().includes(q))
      .sort(ORDENS[ordem][1]);
  }, [grupos, busca, minDias, minAtivos, tipo, soNovas, soTicket, soFav, ordem, fav]);

  if (logado === false) return <Login onOk={carregar} />;
  if (erro) return <p className="vazio">Não consegui carregar o data.json.</p>;
  if (!dados) return <p className="vazio">Carregando...</p>;

  const atualizado = dados.atualizadoEm ? new Date(dados.atualizadoEm).toLocaleString('pt-BR') : 'nunca';

  return (
    <div className="app">
      <header>
        <h1>Oferteiro</h1>
        <button className="sair" onClick={sair}>Sair</button>
        <span className="sub">{lista.length} de {grupos.length} ofertas · rodada {dados.rodada} · atualizado {atualizado}</span>
      </header>

      <section className="filtros">
        <input placeholder="Buscar anunciante, copy ou link..." value={busca} onChange={e => setBusca(e.target.value)} />
        <label>Dias no ar ≥ <input type="number" min="0" value={minDias} onChange={e => setMinDias(+e.target.value || 0)} /></label>
        <label>Anúncios ativos ≥ <input type="number" min="1" value={minAtivos} onChange={e => setMinAtivos(+e.target.value || 1)} /></label>
        <label>Destino
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            {['todos', 'checkout', 'site/funil', 'whatsapp', 'instagram', 'marketplace', 'sem link'].map(t => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Ordenar
          <select value={ordem} onChange={e => setOrdem(e.target.value)}>
            {Object.entries(ORDENS).map(([k, [nome]]) => <option key={k} value={k}>{nome}</option>)}
          </select>
        </label>
        <label>Agrupar por
          <select value={por} onChange={e => setPor(e.target.value)}>
            <option value="oferta">Oferta (link de destino)</option>
            <option value="anunciante">Anunciante</option>
          </select>
        </label>
        <label className="chk"><input type="checkbox" checked={soTicket} onChange={e => setSoTicket(e.target.checked)} /> Só ticket baixo (até R$ 20)</label>
        <label className="chk"><input type="checkbox" checked={soNovas} onChange={e => setSoNovas(e.target.checked)} /> Só novas</label>
        <label className="chk"><input type="checkbox" checked={soFav} onChange={e => setSoFav(e.target.checked)} /> Só favoritas</label>
      </section>

      {!lista.length && <p className="vazio">Nenhuma oferta com esses filtros. {dados.rodada === 0 ? 'Rode o robô primeiro (atualizar.bat).' : 'Tente baixar os mínimos.'}</p>}

      <div className="grid">
        {lista.map(g => (
          <article key={g.k} className="card">
            <div className="thumbs">
              {g.lista.filter(a => a.thumb).slice(0, 3).map(a => <img key={a.id} src={a.thumb} loading="lazy" referrerPolicy="no-referrer" alt="" />)}
            </div>
            <div className="corpo">
              <div className="topo">
                <b><span className={'nota' + (g.nota >= 70 ? ' alta' : '')} title="Nota de modelagem (0-100)">{g.nota}</span> {g.anunciante}</b>
                <button className={'fav' + (fav.has(g.k) ? ' on' : '')} onClick={() => toggleFav(g.k)} title="Favoritar">★</button>
              </div>
              <div className="tags">
                <span className="tag ativos">{g.ativos} ativos</span>
                <span className="tag dias">{g.dias} dias</span>
                {g.preco !== null && <span className="tag preco">{brl(g.preco)}</span>}
                <span className="tag">{g.tipo}</span>
                {g.nova && <span className="tag nova">nova</span>}
              </div>
              {g.motivos.length > 0 && <p className="motivos">Por que modelar: {g.motivos.join(' · ')}</p>}
              <p className="copy">{g.copy.slice(0, 200)}</p>
              <div className="links">
                <a href={g.lista[0].link} target="_blank" rel="noreferrer">Biblioteca</a>
                {g.destino && <a href={g.destino} target="_blank" rel="noreferrer">Funil</a>}
                <button onClick={() => copiarBriefing(g)}>{copiado === g.k ? 'Copiado!' : 'Copiar briefing'}</button>
                {g.lista.length > 1 && <button onClick={() => setAberto(aberto === g.k ? null : g.k)}>{aberto === g.k ? 'Fechar' : `Ver ${g.lista.length} anúncios`}</button>}
              </div>
              {aberto === g.k && (
                <ul className="anuncios">
                  {g.lista.map(a => <li key={a.id}><a href={a.link} target="_blank" rel="noreferrer">{a.id}</a> · {a.dias} dias</li>)}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Login({ onOk }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const entrar = async e => {
    e.preventDefault(); setEnviando(true); setMsg('');
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
      if (r.ok) return onOk();
      setMsg((await r.json().catch(() => ({}))).erro || 'Erro ao entrar.');
    } catch { setMsg('Sem conexão.'); }
    setEnviando(false);
  };
  return (
    <form className="login" onSubmit={entrar}>
      <h1>Oferteiro</h1>
      <input type="email" placeholder="E-mail" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
      <input type="password" placeholder="Senha" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required />
      <button disabled={enviando}>{enviando ? 'Entrando...' : 'Entrar'}</button>
      {msg && <p className="erro">{msg}</p>}
    </form>
  );
}
