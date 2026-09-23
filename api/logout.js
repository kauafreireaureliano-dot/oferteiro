import { limparCookie } from './_auth.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', limparCookie());
  res.status(200).json({ ok: true });
}
