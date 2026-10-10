# FlowPay on Monad testnet

An x402 v1 HTTP payment route using Circle test USDC on Monad testnet (chain 10143).
Designed and shipped by Alhassan Mohammed with AI tooling.

TESTNET ONLY. No real money, fiat funding, cross-border supplier execution, or Nines real-charge path.
This demonstrates the on-chain settlement leg of FlowOS, not a complete Ghana-to-USD service.

The buyer gets HTTP 402, signs EIP-3009, retries with X-PAYMENT, and the self-hosted facilitator settles USDC directly from buyer to seller. A successful chain receipt is required before serving the paid JSON response. Exact amounts, recipient, signature, balance, expiry and nonce are checked. Mainnet is absent from the registry. Demo amount cap: 0.1 test USDC per payment; the hosted button uses 0.001. Demo rate limit is best-effort per function instance, not a durable production control.

## Run

npm ci
npm test

Deploy api/, src/, and public/ to Vercel with server-only FACILITATOR_PRIVATE_KEY, DEMO_BUYER_KEY, and PAY_TO. Never commit keys.

Endpoints: GET /api/quote (402 without payment), POST /api/demo-run, GET /api/manifest, and /api/facilitator/{supported,verify,settle}.

Token: 0x534b2f3A21130d7a60830c2Df862319e593943A3, USDC / 2 EIP-712 domain, 6 decimals.
Official docs: https://docs.monad.xyz/guides/x402
Network: https://docs.monad.xyz/developer-essentials/testnets

Ported from the MIT-licensed x402-avax settlement library. Original copyright notice is preserved in LICENSE. No external image-generation service or paid credits are used.
