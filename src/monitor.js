import fs from "node:fs/promises";
const cfg=JSON.parse(await fs.readFile("config/retailers.json","utf8"));
async function read(p,f){try{return JSON.parse(await fs.readFile(p,"utf8"))}catch{return f}}
const old=await read("docs/status.json",{retailers:[],secured:0});
const previous=new Map((old.retailers||[]).map(x=>[x.id,x]));
const now=new Date().toISOString();
const SB="https://hcjqrvzmkchgcncoqzvl.supabase.co/functions/v1/needoh-fallback-report";
const priority=new Set(["menkind","smyths"]);
function detect(html,r){
 const t=html.replace(/\s+/g," ").toLowerCase();
 if(!t.includes(r.product.toLowerCase())) return "unknown";
 if((r.outOfStock||[]).some(x=>t.includes(x.toLowerCase()))) return "out_of_stock";
 if((r.inStock||[]).some(x=>t.includes(x.toLowerCase()))) return "in_stock";
 return "watching";
}
const retailers=[];
for(const r of cfg){
 let status="error",note="";
 try{
  const res=await fetch(r.url,{redirect:"follow",headers:{"user-agent":"Mozilla/5.0 (compatible; personal stock availability monitor)","accept-language":"en-GB,en;q=0.9"}});
  if(!res.ok) throw new Error("HTTP "+res.status);
  status=detect(await res.text(),r);
 }catch(e){note=String(e.message||e).slice(0,160)}
 const prev=previous.get(r.id);
 retailers.push({...r,status,note,checkedAt:now,changedAt:prev&&prev.status===status?(prev.changedAt||prev.checkedAt):now});
 if(priority.has(r.id)&&(status==="error"||status==="unknown")) console.warn("PRIORITY MONITOR DEGRADED:",r.name,status,note);
}
const priorityResults=retailers.filter(x=>x.id==="menkind"||x.id==="smyths");
try{const rr=await fetch(SB,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({source:"github-actions",checkedAt:now,retailers:priorityResults.map(x=>({id:x.id,status:x.status,httpStatus:x.note?.startsWith("HTTP ")?Number(x.note.slice(5)):200,url:x.url,price:x.price}))})});console.log("Fallback report:",rr.status)}catch(e){console.warn("Fallback report failed:",String(e))}
const state={updatedAt:now,target:10,secured:old.secured||0,retailers};
await fs.mkdir("docs",{recursive:true});
await fs.writeFile("docs/status.json",JSON.stringify(state,null,2)+"\n");
for(const r of retailers){
 const prev=previous.get(r.id);
 if(r.status==="in_stock"&&(!prev||prev.status!=="in_stock")) console.log("STOCK ALERT:",r.name,r.url);
}
console.log(JSON.stringify(state,null,2));