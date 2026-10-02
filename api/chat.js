const {randomBytes,createHmac,timingSafeEqual}=require('node:crypto');
const COOKIE='__Host-squ-session';
const TTL=86400;
const languages=new Set(['en','fr','es','de','it','nl','zh','ja','ko','pt']);
function sign(value,key){return createHmac('sha256',key).update(value).digest('hex');}
function session(value,key,now){
 if(typeof value!=='string'||!/^([a-f0-9]{48})\.(\d{10})\.([a-f0-9]{64})$/.test(value)) return null;
 const [id,expiry,mac]=value.split('.');
 if(Number(expiry)<=now||Number(expiry)>now+TTL+60) return null;
 return timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(sign(id+'.'+expiry,key),'hex'))?id:null;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const fail=(code,error)=>res.status(code).json({error});
 if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'Method not allowed');}
 const key=process.env.SQU_SESSION_KEY, gateway=process.env.SQU_GATEWAY_KEY;
 const kind=process.env.SQU_CHAT_KIND;
 if(!key||!gateway||!['brand','distrib'].includes(kind)) return fail(503,'Chat temporarily unavailable');
 const allowed=kind==='brand'?'https://squ-template-chat.vercel.app':'https://distributor-chat.vercel.app';
 if(req.headers.origin!==allowed) return fail(403,'Forbidden');
 if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) return fail(415,'JSON required');
 if(Number(req.headers['content-length']||0)>12000) return fail(413,'Message too large');
 let b=req.body;
 try {if(typeof b==='string') b=JSON.parse(b);}catch{return fail(400,'Invalid request');}
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.message!=='string'||!b.message.trim()||b.message.length>2000||b.message.includes('\0')) return fail(400,'Please enter a message of 1–2,000 characters.');
 if(b.productId!==undefined&&(typeof b.productId!=='string'||!/^[a-zA-Z0-9_-]{0,80}$/.test(b.productId))) return fail(400,'Invalid product');
 const now=Math.floor(Date.now()/1000);
 const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 let id=b.newConversation===true?null:session(cookie,key,now);
 if(!id){
  id=randomBytes(24).toString('hex');const value=id+'.'+(now+TTL);
  res.setHeader('Set-Cookie',`${COOKIE}=${value}.${sign(value,key)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`);
 }
 // Vercel overwrites this header with its trusted connection IP. Never use a client-supplied chatId.
 const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
 const body={message:b.message.trim(),chatId:kind+'_'+id,productId:b.productId||'BRAND',language:languages.has(b.language)?b.language:'en',currency:'EUR',country:'FR',ipHash:sign('ip:'+ip,key)};
 try{
  const upstream=await fetch('https://n8n.srv1208833.hstgr.cloud/webhook/'+(kind==='brand'?'squ-template-chat':'distributor_chat'),{method:'POST',headers:{'Content-Type':'application/json','x-squ-gateway':gateway},body:JSON.stringify(body),signal:AbortSignal.timeout(50000)});
  if(upstream.status===429){res.setHeader('Retry-After','60');return fail(429,'Too many messages. Please try again later.');}
  if(!upstream.ok)return fail(502,'Chat temporarily unavailable. Please try again.');
  const data=await upstream.json();
  if(typeof data.reply!=='string')return fail(502,'Chat temporarily unavailable. Please try again.');
  return res.status(200).json({reply:data.reply.slice(0,24000),product_card:data.product_card||null});
 }catch{return fail(502,'Chat temporarily unavailable. Please try again.');}
};
module.exports.session=session;
module.exports.sign=sign;
