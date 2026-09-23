import { criarCookie, igual } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !SESSION_SECRET) return res.status(500).json({ erro: 'Servidor sem credenciais configuradas.' });
  const { email = '', senha = '' } = req.body || {};
  const ok = igual(String(email).trim().toLowerCase(), ADMIN_EMAIL.toLowerCase()) & igual(senha, ADMIN_PASSWORD);
  if (!ok) {
    await new Promise(r => setTimeout(r, 1000)); // freia tentativa em massa
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  res.setHeader('Set-Cookie', criarCookie());
  res.status(200).json({ ok: true });
}
