// Monad testnet only. Official Circle test USDC, zero real-world value.
export const NETWORKS = {
 'monad-testnet': { name:'monad-testnet', caip2:'eip155:10143',chainId:10143,
 rpcUrl:'https://testnet-rpc.monad.xyz',usdc:'0x534b2f3A21130d7a60830c2Df862319e593943A3',
 usdcDomain:{name:'USDC',version:'2'},explorer:'https://testnet.monadscan.com',testnet:true }
};
export function getNetwork(name) {
 const net=NETWORKS[name]||Object.values(NETWORKS).find(n=>n.caip2===name);
 if(!net) throw new Error(`Unsupported network: ${name}`);
 return net;
}
export function usdToAtomic(usd) {
 const [whole,frac='']=String(usd).replace(/^\$/,'').split('.');
 if(!/^\d+$/.test(whole)||!/^\d*$/.test(frac)||frac.length>6) throw new Error('Invalid USDC amount');
 return (BigInt(whole)*1000000n+BigInt((frac+'000000').slice(0,6))).toString();
}
export function atomicToUsd(atomic) {
 const v=BigInt(atomic);const frac=(v%1000000n).toString().padStart(6,'0').replace(/0+$/,'');
 return `${v/1000000n}${frac?'.'+frac:''}`;
}
