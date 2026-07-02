// Serverless: guarda/recupera estado via Upstash Redis.
// GET -> {v,data}  POST -> {data} -> {ok,v}
const REDIS_KEY = process.env.REDIS_KEY || 'radar-parcerias-paraello-v2:state:v1';
function kvUrl(){return process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;}
function kvToken(){return process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;}
async function redis(cmd){
  const r=await fetch(kvUrl(),{method:'POST',headers:{Authorization:'Bearer '+kvToken(),'Content-Type':'application/json'},body:JSON.stringify(cmd)});
  const txt=await r.text().catch(()=>{throw new Error('redis '+r.status);});
  if(!r.ok)throw new Error('redis '+r.status+': '+txt);
  return JSON.parse(txt);
}
async function readState(){
  const out=await redis(['GET',REDIS_KEY]);
  const raw=out&&out.result;
  if(!raw)return{v:0,data:null};
  let p;try{p=JSON.parse(raw);}catch{return{v:0,data:null};}
  if(p&&typeof p.v==='number')return p;
  return{v:0,data:p};
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!kvUrl()||!kvToken())return res.status(500).json({error:'storage_not_configured'});
  try{
    if(req.method==='GET'){
      const s=await readState();
      if(req.query&&req.query.v)return res.status(200).json({v:s.v});
      return res.status(200).json(s);
    }
    if(req.method==='POST'){
      let b=req.body;
      if(typeof b==='string'){try{b=JSON.parse(b);}catch{b={};}}
      const data=(b&&b.data!==undefined)?b.data:(typeof b==='object'?b:{});
      const cur=await readState();
      const nv=(cur.v||0)+1;
      await redis(['SET',REDIS_KEY,JSON.stringify({v:nv,data})]);
      return res.status(200).json({ok:true,v:nv});
    }
    res.status(405).json({error:'method_not_allowed'});
  }catch(e){res.status(502).json({error:'storage_error',detail:String(e.message)});}
};
