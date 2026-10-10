import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { usdToAtomic, atomicToUsd, paymentRequirements, createPaymentHeader, createFacilitator } from '../src/index.js';
import { decodeHeader } from '../src/eip3009.js';

test('price conversion', () => {
  assert.equal(usdToAtomic('0.05'), '50000');
  assert.equal(usdToAtomic('$1.5'), '1500000');
  assert.equal(atomicToUsd('1000'), '0.001');
  assert.throws(() => usdToAtomic('0.0000001'));
});

test('signed header passes offline signature checks and rejects tampering', async () => {
  const buyer = privateKeyToAccount(generatePrivateKey());
  const reqs = paymentRequirements({ price: '0.05', payTo: privateKeyToAccount(generatePrivateKey()).address, resource: 'http://x/paid' });
  const payload = decodeHeader(await createPaymentHeader(buyer, reqs));
  assert.equal(payload.network, 'monad-testnet');
  assert.equal(payload.payload.authorization.value, '50000');
  const fac = createFacilitator({ rpcUrls: { 'monad-testnet': 'http://127.0.0.1:1' } });
  payload.payload.authorization.value = '60000'; // tamper after signing
  const v = await fac.verify(payload, reqs);
  assert.equal(v.isValid, false);
  assert.equal(v.invalidReason, 'amount_mismatch');
});
