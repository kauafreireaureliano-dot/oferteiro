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

function agrupar(ads, por) {
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
    return {
      k, lista, ativos: lista.length, dias: maisAntigo.dias,
      anunciante: maisAntigo.anunciante || '(sem nome)',
      copy: lista.find(a => a.copy)?.copy || '',
      destino: dest, tipo: tipoDestino(dest),
      nova: lista.some(a => a.nova),
      score: Math.min(maisAntigo.dias, 365) + Math.min(lista.length, 60) * 6,
    };
  });
}

const ORDENS = {
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
  const [busca, setBusca] = useState('');
  const [minDias, setMinDias] = useState(30);
  const [minAtivos, setMinAtivos] = useState(2);
  const [tipo, setTipo] = useState('todos');
  const [ordem, setOrdem] = useState('score');
  const [por, setPor] = useState('oferta');
  const [soNovas, setSoNovas] = useState(false);
  const [soFav, setSoFav] = useState(false);
  const [aberto, setAberto] = useState(null);
  const [fav, toggleFav] = useFavoritos();

  useEffect(() => {
    fetch('/data.json?' + Date.now()).then(r => r.json()).then(setDados).catch(() => setErro(true));
  }, []);

  const grupos = useMemo(() => {
    if (!dados) return [];
    const ativos = dados.ads
      .filter(a => a.rodada === dados.rodada)
      .map(a => ({ ...a, nova: a.rodadaNova === dados.rodada && dados.rodada > 1 }));
    return agrupar(ativos, por);
  }, [dados, por]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return grupos
      .filter(g => g.dias >= minDias && g.ativos >= minAtivos)
      .filter(g => tipo === 'todos' || g.tipo === tipo)
      .filter(g => !soNovas || g.nova)
      .filter(g => !soFav || fav.has(g.k))
      .filter(g => !q || (g.anunciante + ' ' + g.copy + ' ' + g.destino).toLowerCase().includes(q))
      .sort(ORDENS[ordem][1]);
  }, [grupos, busca, minDias, minAtivos, tipo, soNovas, soFav, ordem, fav]);

  if (erro) return <p className="vazio">Não consegui carregar o data.json.</p>;
  if (!dados) return <p className="vazio">Carregando...</p>;

  const atualizado = dados.atualizadoEm ? new Date(dados.atualizadoEm).toLocaleString('pt-BR') : 'nunca';

  return (
    <div className="app">
      <header>
        <h1>Oferteiro</h1>
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
                <b>{g.anunciante}</b>
                <button className={'fav' + (fav.has(g.k) ? ' on' : '')} onClick={() => toggleFav(g.k)} title="Favoritar">★</button>
              </div>
              <div className="tags">
                <span className="tag ativos">{g.ativos} ativos</span>
                <span className="tag dias">{g.dias} dias</span>
                <span className="tag">{g.tipo}</span>
                {g.nova && <span className="tag nova">nova</span>}
              </div>
              <p className="copy">{g.copy.slice(0, 200)}</p>
              <div className="links">
                <a href={g.lista[0].link} target="_blank" rel="noreferrer">Biblioteca</a>
                {g.destino && <a href={g.destino} target="_blank" rel="noreferrer">Funil</a>}
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
