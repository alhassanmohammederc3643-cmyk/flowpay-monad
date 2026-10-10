import { facilitator, cors } from '../_lib.js';
export default function handler(req, res) { cors(res); res.json({ ...facilitator.supported(), settlementSigner: facilitator.address }); }
