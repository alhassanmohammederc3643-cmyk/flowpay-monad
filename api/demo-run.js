// Runs the buyer agent server-side against this deployment, using the public demo buyer wallet
// (Monad testnet testnet USDC only), and returns every step so the page can show the loop.
import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetch, atomicToUsd } from '../src/index.js';
import { cors } from './_lib.js';

const hits = new Map(); // light per-IP limit so the demo wallet isn't drained
export default async function handler(req, res) {
  cors(res);
  if (req.method !== 'POST') return res.status(405).json({error:'Use POST'});
  const key = process.env.DEMO_BUYER_KEY;
  if (!key) return res.status(503).json({ error: 'Demo buyer not configured' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'anon';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 3) return res.status(429).json({ error: 'Slow down: 3 demo runs per minute' });
  hits.set(ip, [...recent, now]);

  const kind = 'quote';
  const base = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL}`;
  const url = `${base}/api/quote`;
  const account = privateKeyToAccount(key);
  const steps = [];
  const t0 = Date.now();
  try {
    const first = await fetch(url);
    const body402 = await first.json();
    steps.push({ step: 'request', status: first.status, accepts: body402.accepts?.[0] });
    const pay = wrapFetch(fetch, account, { maxAtomic: '100000' });
    const res2 = await pay(url);
    const body = await res2.json();
    steps.push({ step: 'signed EIP-3009 authorization and retried with X-PAYMENT', payer: account.address, amountUsd: atomicToUsd(body402.accepts[0].maxAmountRequired) });
    steps.push({ step: 'response', status: res2.status, payment: res2.payment, body });
    res.status(res2.ok ? 200 : 502).json({ ok: res2.ok, kind, seconds: (Date.now() - t0) / 1000, steps });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, steps });
  }
}
