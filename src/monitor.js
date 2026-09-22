import fs from "node:fs/promises";
import { chromium } from "playwright";
const cfg=JSON.parse(await fs.readFile("config/retailers.json","utf8"));
async function read(p,f){try{return JSON.parse(await fs.readFile(p,"utf8"))}catch{return f}}
const old=await read("docs/status.json",{retailers:[],secured:0});
const previous=new Map((old.retailers||[]).map(x=>[x.id,x]));
const now=new Date().toISOString();
const SB="https://hcjqrvzmkchgcncoqzvl.supabase.co/functions/v1/needoh-fallback-report";
console.log("NeeDoh monitor starting",now);
const priority=new Set(["menkind","smyths"]);
function detect(html,r){
 const t=html.replace(/\s+/g," ").toLowerCase();
 const has=(x)=>t.includes(String(x).toLowerCase());
 if(r.id==="smyths"){
  const exact=has("needoh 2026 advent calendar")||has("needoh%202026%20advent%20calendar")||has("needoh-2026-advent-calendar");
  if(!exact) return "unknown";
  // Smyths has separate fulfilment controls. Never use store-level "out of stock" text for online stock.
  const deliveryGroup=t.match(/aria-label=["']delivery options["'][\\s\\S]{0,7000}/)?.[0]||"";
  const deliveryDisabled=/aria-disabled=["']true["']/.test(deliveryGroup);
  const deliveryEnabled=/aria-disabled=["']false["']/.test(deliveryGroup);
  const basketDisabled=/<button[^>]*disabled[^>]*>[\\s\\S]{0,500}add to basket/i.test(html)||/<button[^>]*data-v-[^>]*disabled[^>]*>[\\s\\S]{0,500}add to basket/i.test(html);
  const basketEnabled=/<button(?![^>]*disabled)[^>]*>[\\s\\S]{0,500}add to basket/i.test(html);
  if((has("pre-order")||has("pre order"))&&(deliveryEnabled||basketEnabled)) return "preorder";
  if(deliveryEnabled&&basketEnabled) return "in_stock";
  if(deliveryDisabled&&basketDisabled) return "out_of_stock";
  return "watching";
 }
 if(r.id==="menkind"){
  const exact=has("needoh 24 days fidget advent calendar")&&(has("product code: 131163")||has("product code: **131163**")||has("sysqmac26")||has("019649506170"));
  if(!exact)return "unknown";
  if(has("out of stock")||has("sold out")||has("notify me when"))return "out_of_stock";
  if((has("pre-order")||has("preorder"))&&(has("add to basket")||has("add to cart")))return "preorder";
  if((has("add to basket")||has("add to cart"))&&!has("adding to basket... the item has been added"))return "in_stock";
  return "watching";
 }
 if(!has(r.product)) return "unknown";
 if((r.outOfStock||[]).some(has)) return "out_of_stock";
 if((r.inStock||[]).some(has)) return "in_stock";
 return "watching";
}
const retailers=[];
for(const r of cfg){
 let status="error",note="";
 try{
  if(r.id==="smyths"){
    const apiPart="/api/uk/en-gb/product/product-inventory?code=258225";
    let browser;
    let inv;
    try{
      browser=await chromium.launch({headless:true});
      const context=await browser.newContext({locale:"en-GB",userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"});
      const page=await context.newPage();
      const inventoryResponse=page.waitForResponse(resp=>resp.url().includes(apiPart),{timeout:45000});
      await page.goto(r.url,{waitUntil:"domcontentloaded",timeout:45000});
      const resp=await inventoryResponse;
      if(resp.status()!==200) throw new Error("Smyths page inventory HTTP "+resp.status());
      inv=await resp.json();
    } finally { if(browser) await browser.close(); }
    if(String(inv?.code)!=="258225") throw new Error("Smyths inventory product mismatch");
    const hd=inv?.hdSection||{};
    const price=Number(inv?.prices?.value);
    if(hd.isPreOrder===true) status="preorder";
    else if(hd.isAvailableForDelivery===true) status="in_stock";
    else if(hd.stockStatus==="OUTOFSTOCK"||hd.isAvailableForDelivery===false) status="out_of_stock";
    else status="watching";
    note="Smyths inventory API; HD="+String(hd.stockStatus||"unknown")+"; delivery="+String(hd.isAvailableForDelivery)+"; price="+(Number.isFinite(price)?price:"?");
  } else {
  const res=await fetch(r.url,{redirect:"follow",headers:{"user-agent":"Mozilla/5.0 (compatible; personal stock availability monitor)","accept-language":"en-GB,en;q=0.9"}});
  let body;
  if(!res.ok && r.id==="menkind" && res.status===403){
    const proxy="https://r.jina.ai/https://www.menkind.co.uk/needoh-24-days-fidget-advent-calendar";
    const pr=await fetch(proxy,{headers:{"accept":"text/plain"}});
    if(!pr.ok) throw new Error("HTTP 403; reader "+pr.status);
    body=await pr.text();
    note="MenKind reader fallback";
  } else {
    if(!res.ok) throw new Error("HTTP "+res.status);
    body=await res.text();
  }
  status=detect(body,r);
  }
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