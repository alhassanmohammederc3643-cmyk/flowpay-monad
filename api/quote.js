import { paid } from './_lib.js';
export default paid({ price: '0.001', description: 'Demo paid JSON endpoint' }, (req, res) => {
  const { settle, deny, ...paidWith } = req.x402;
  res.json({ message: 'You paid $0.001 in USDC on Monad testnet for this response.', paidWith });
});
