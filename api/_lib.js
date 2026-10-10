// Shared setup for the hosted Monad testnet demo (Vercel functions). Testnet only.
import { createFacilitator, x402Monad } from '../src/index.js';

export const NETWORK = 'monad-testnet';
export const PAY_TO = process.env.PAY_TO;
export const facilitator = createFacilitator({ privateKey: process.env.FACILITATOR_PRIVATE_KEY, networks: [NETWORK] });

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
}

// Run an x402Monad middleware inside a plain Vercel handler.
export function paid(opts, handler) {
  const mw = x402Monad({ network: NETWORK, payTo: PAY_TO, facilitator, ...opts });
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    await mw(req, res, () => handler(req, res));
  };
}
