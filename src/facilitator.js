// Self-hosted x402 facilitator for Monad C-Chain.
// verify(): checks an x402 "exact" payment offchain (signature, amount, recipient, time window,
//           balance, nonce not yet used) without spending gas.
// settle(): submits USDC.transferWithAuthorization onchain. The facilitator pays the MON gas;
//           the buyer only signs. Funds move buyer -> seller directly, never through the facilitator.
import { createPublicClient, createWalletClient, http, verifyTypedData, parseSignature, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetwork } from './networks.js';
import { TRANSFER_WITH_AUTHORIZATION_TYPES, USDC_ABI, usdcDomain } from './eip3009.js';

function chainFor(net) {
  return {
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [net.rpcUrl] } },
  };
}

export function createFacilitator({ privateKey, networks = ['monad-testnet'], rpcUrls = {} } = {}) {
  const account = privateKey ? privateKeyToAccount(privateKey) : null;
  const clients = {};
  for (const name of networks) {
    const net = { ...getNetwork(name) };
    if (rpcUrls[name]) net.rpcUrl = rpcUrls[name];
    const chain = chainFor(net);
    clients[name] = {
      net,
      pub: createPublicClient({ chain, transport: http(net.rpcUrl) }),
      wallet: account ? createWalletClient({ account, chain, transport: http(net.rpcUrl) }) : null,
    };
  }
  // Guards against settling the same authorization twice while a tx is in flight.
  const inFlight = new Set();

  async function verify(paymentPayload, requirements) {
    const fail = (invalidReason, payer) => ({ isValid: false, invalidReason, payer });
    try {
      if (paymentPayload?.scheme !== 'exact' || requirements?.scheme !== 'exact') return fail('unsupported_scheme');
      if (paymentPayload.network !== requirements.network) return fail('network_mismatch');
      const c = clients[requirements.network];
      if (!c) return fail('unsupported_network');
      const { signature, authorization: a } = paymentPayload.payload || {};
      if (!signature || !a) return fail('invalid_payload');
      const payer = getAddress(a.from);
      const asset = getAddress(requirements.asset || c.net.usdc);
      if (asset !== getAddress(c.net.usdc)) return fail('unsupported_asset', payer);
      if (getAddress(a.to) !== getAddress(requirements.payTo)) return fail('recipient_mismatch', payer);
      if (BigInt(a.value) !== BigInt(requirements.maxAmountRequired)) return fail('amount_mismatch', payer);
      if (BigInt(a.value) > 100000n || BigInt(a.value) <= 0n) return fail('testnet_demo_amount_cap', payer);
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (BigInt(a.validAfter) > now) return fail('authorization_not_yet_valid', payer);
      if (BigInt(a.validBefore) < now + 6n) return fail('authorization_expired', payer);

      const message = {
        from: payer, to: getAddress(a.to), value: BigInt(a.value),
        validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce,
      };
      const sigOk = await verifyTypedData({
        address: payer, domain: usdcDomain(c.net, asset), types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: 'TransferWithAuthorization', message, signature,
      });
      if (!sigOk) return fail('invalid_signature', payer);

      const [balance, used] = await Promise.all([
        c.pub.readContract({ address: asset, abi: USDC_ABI, functionName: 'balanceOf', args: [payer] }),
        c.pub.readContract({ address: asset, abi: USDC_ABI, functionName: 'authorizationState', args: [payer, a.nonce] }),
      ]);
      if (used) return fail('nonce_already_used', payer);
      if (balance < message.value) return fail('insufficient_funds', payer);
      return { isValid: true, payer };
    } catch (err) {
      return fail(`verify_error: ${err.shortMessage || err.message}`);
    }
  }

  async function settle(paymentPayload, requirements) {
    const network = requirements?.network;
    const v = await verify(paymentPayload, requirements);
    if (!v.isValid) return { success: false, errorReason: v.invalidReason, payer: v.payer, network, transaction: '' };
    const c = clients[network];
    if (!c.wallet) return { success: false, errorReason: 'facilitator_has_no_signer', payer: v.payer, network, transaction: '' };
    const { signature, authorization: a } = paymentPayload.payload;
    const key = `${network}:${a.from.toLowerCase()}:${a.nonce}`;
    if (inFlight.has(key)) return { success: false, errorReason: 'settlement_in_progress', payer: v.payer, network, transaction: '' };
    inFlight.add(key);
    try {
      const sig = parseSignature(signature);
      const vByte = sig.v !== undefined ? Number(sig.v) : sig.yParity + 27;
      const args = [getAddress(a.from), getAddress(a.to), BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, vByte, sig.r, sig.s];
      const asset = getAddress(requirements.asset || c.net.usdc);
      const { request } = await c.pub.simulateContract({ account, address: asset, abi: USDC_ABI, functionName: 'transferWithAuthorization', args });
      const hash = await c.wallet.writeContract(request);
      const receipt = await c.pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status !== 'success') return { success: false, errorReason: 'transaction_reverted', payer: v.payer, network, transaction: hash };
      return { success: true, payer: v.payer, network, transaction: hash, explorer: `${c.net.explorer}/tx/${hash}` };
    } catch (err) {
      return { success: false, errorReason: `settle_error: ${err.shortMessage || err.message}`, payer: v.payer, network, transaction: '' };
    } finally {
      inFlight.delete(key);
    }
  }

  function supported() {
    return { kinds: Object.keys(clients).map((network) => ({ x402Version: 1, scheme: 'exact', network })) };
  }

  return { verify, settle, supported, address: account?.address };
}
