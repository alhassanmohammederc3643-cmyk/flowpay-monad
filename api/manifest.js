import { cors, NETWORK, PAY_TO, facilitator } from './_lib.js';
export default function handler(req, res) {
  cors(res);
  res.json({
    name: 'flowpay-monad live demo',
    source: 'https://github.com/alhassanmohammederc3643-cmyk/flowpay-monad',
    payment: { protocol: 'x402', version: 1, scheme: 'exact', network: NETWORK, asset: 'USDC', payTo: PAY_TO, endpoints: { '/api/quote': '0.001' } },
    facilitator: { url: '/api/facilitator', supported: '/api/facilitator/supported', signer: facilitator.address },
  });
}
