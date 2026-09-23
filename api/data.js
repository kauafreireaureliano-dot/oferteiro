import fs from 'node:fs';
import path from 'node:path';
import { autenticado } from './_auth.js';

export default function handler(req, res) {
  if (!autenticado(req)) return res.status(401).json({ erro: 'não autenticado' });
  const arq = path.join(process.cwd(), 'data', 'data.json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(fs.readFileSync(arq, 'utf8'));
}
