import { facilitator, cors } from '../_lib.js';
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST { x402Version, paymentPayload, paymentRequirements }' });
  const { paymentPayload, paymentRequirements } = req.body || {};
  res.json(await facilitator.verify(paymentPayload, paymentRequirements));
}
