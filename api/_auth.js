import crypto from 'node:crypto';

const SEMANA = 7 * 24 * 3600;

const assinar = (exp) =>
  crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(String(exp)).digest('hex');

export function criarCookie() {
  const exp = Math.floor(Date.now() / 1000) + SEMANA;
  return `sess=${exp}.${assinar(exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SEMANA}`;
}

export const limparCookie = () => 'sess=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';

export function autenticado(req) {
  if (!process.env.SESSION_SECRET) return false;
  const m = /(?:^|;\s*)sess=(\d+)\.([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [, exp, sig] = m;
  if (+exp < Date.now() / 1000) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(assinar(exp)));
}

export function igual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
