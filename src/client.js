// Buyer side: turn a 402 response into a signed X-PAYMENT header and retry.
//   const pay = wrapFetch(fetch, account, { maxAtomic: '100000' });
//   const res = await pay('https://seller/paid');
import { randomBytes } from 'node:crypto';
import { getAddress } from 'viem';
import { getNetwork } from './networks.js';
import { TRANSFER_WITH_AUTHORIZATION_TYPES, encodeHeader, decodeHeader } from './eip3009.js';

export async function createPaymentHeader(account, requirements) {
  const net = getNetwork(requirements.network);
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: getAddress(requirements.payTo),
    value: BigInt(requirements.maxAmountRequired),
    validAfter: BigInt(now - 600), // tolerate clock skew between buyer and chain
    validBefore: BigInt(now + (requirements.maxTimeoutSeconds || 300)),
    nonce: `0x${randomBytes(32).toString('hex')}`,
  };
  const signature = await account.signTypedData({
    domain: {
      name: requirements.extra?.name || net.usdcDomain.name,
      version: requirements.extra?.version || net.usdcDomain.version,
      chainId: net.chainId,
      verifyingContract: getAddress(requirements.asset || net.usdc),
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });
  return encodeHeader({
    x402Version: 1,
    scheme: 'exact',
    network: requirements.network,
    payload: {
      signature,
      authorization: {
        ...authorization,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
      },
    },
  });
}

// maxAtomic caps what the buyer will ever sign for a single request (default $0.10).
export function wrapFetch(fetchImpl, account, { maxAtomic = '100000', networks = ['monad-testnet', 'avalanche'] } = {}) {
  return async (url, init = {}) => {
    const first = await fetchImpl(url, init);
    if (first.status !== 402) return first;
    const body = await first.json();
    const req = (body.accepts || []).find((r) => r.scheme === 'exact' && networks.includes(r.network));
    if (!req) throw new Error(`No acceptable Monad payment option in 402: ${JSON.stringify(body)}`);
    if (BigInt(req.maxAmountRequired) > BigInt(maxAtomic)) throw new Error(`Price ${req.maxAmountRequired} exceeds cap ${maxAtomic}`);
    const header = await createPaymentHeader(account, req);
    const res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), 'X-PAYMENT': header } });
    const pr = res.headers.get('X-PAYMENT-RESPONSE');
    res.payment = pr ? decodeHeader(pr) : null;
    res.requirements = req;
    return res;
  };
}
