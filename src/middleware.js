// Seller side: gate any Express route behind an x402 payment on Monad.
//   app.get('/paid', x402Monad({ price: '0.05', payTo: '0xSeller' }), handler)
// Speaks x402 v1 on the wire: 402 + { x402Version, accepts }, client retries with X-PAYMENT,
// server answers with X-PAYMENT-RESPONSE carrying the settlement tx.
import { getNetwork, usdToAtomic } from './networks.js';
import { decodeHeader, encodeHeader } from './eip3009.js';

export function paymentRequirements({ price, payTo, network = 'monad-testnet', resource, description = '', maxTimeoutSeconds = 300, mimeType = 'application/json' }) {
  const net = getNetwork(network);
  return {
    scheme: 'exact',
    network: net.name,
    maxAmountRequired: usdToAtomic(price),
    resource,
    description,
    mimeType,
    payTo,
    maxTimeoutSeconds,
    asset: net.usdc,
    extra: { name: net.usdcDomain.name, version: net.usdcDomain.version },
  };
}

// facilitator: either a URL of a running facilitator server, or an in-process object from createFacilitator().
function facilitatorClient(facilitator) {
  if (typeof facilitator !== 'string') return facilitator;
  const call = async (path, paymentPayload, paymentRequirements) => {
    const res = await fetch(`${facilitator.replace(/\/$/, '')}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x402Version: 1, paymentPayload, paymentRequirements }),
    });
    return res.json();
  };
  return { verify: (p, r) => call('verify', p, r), settle: (p, r) => call('settle', p, r) };
}

// settle: 'before' (default) settles onchain before your handler runs - simplest, seller never serves unpaid.
//         'after' only verifies up front; your handler does the work, then calls `await req.x402.settle()`
//         before responding. The buyer is charged only when the work succeeded.
export function x402Monad({ price, payTo, network = 'monad-testnet', facilitator, description, onSettled, settle = 'before' } = {}) {
  if (!price || !payTo) throw new Error('x402Monad needs price and payTo');
  if (!facilitator) throw new Error('x402Monad needs a facilitator URL or instance');
  const fac = facilitatorClient(facilitator);

  return async (req, res, next) => {
    // Works with Express and with plain Node / Vercel functions.
    const header = (h) => (req.get ? req.get(h) : req.headers[h.toLowerCase()]);
    const setHeader = (k, v) => (res.set ? res.set(k, v) : res.setHeader(k, v));
    const proto = (header('x-forwarded-proto') || req.protocol || 'http').split(',')[0];
    const resource = `${proto}://${header('host')}${req.originalUrl || req.url}`;
    const reqs = paymentRequirements({ price, payTo, network, resource, description });
    const deny = (error, extra = {}) => res.status(402).json({ x402Version: 1, error, accepts: [reqs], ...extra });

    const xPayment = header('X-PAYMENT');
    if (!xPayment) return deny('X-PAYMENT header is required');
    let payload;
    try { payload = decodeHeader(xPayment); } catch { return deny('Malformed X-PAYMENT header'); }

    const v = await fac.verify(payload, reqs);
    if (!v.isValid) return deny(v.invalidReason || 'Payment invalid', { payer: v.payer });

    const doSettle = async () => {
      const s = await fac.settle(payload, reqs);
      if (!s.success) return { ok: false, reason: s.errorReason || 'Settlement failed', payer: s.payer };
      setHeader('X-PAYMENT-RESPONSE', encodeHeader({ success: true, transaction: s.transaction, network: s.network, payer: s.payer }));
      setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
      Object.assign(req.x402, { transaction: s.transaction, network: s.network, explorer: s.explorer, settled: true });
      if (onSettled) onSettled(req.x402);
      return { ok: true, ...req.x402 };
    };
    req.x402 = { payer: v.payer, amount: reqs.maxAmountRequired, network: reqs.network, settled: false };

    if (settle === 'after') {
      req.x402.settle = doSettle;
      req.x402.deny = (reason) => deny(reason);
      return next();
    }
    // Settle before serving, so the seller never delivers unpaid work.
    const r = await doSettle();
    if (!r.ok) return deny(r.reason, { payer: r.payer });
    next();
  };
}
