const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.ADMIN_PIN || "0110";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

async function sendTelegram(text){
  if(!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try{
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        chat_id:TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview:true
      })
    });
  }catch(_e){
    // Notification failure must never block a customer order.
  }
}

const headers = {
  "Content-Type":"application/json",
  "apikey":SB_KEY || "",
  "Authorization":`Bearer ${SB_KEY || ""}`
};
const j = (statusCode, body)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)});
async function sb(path, opts={}) {
  if(!SB_URL || !SB_KEY) throw new Error("Database is not configured");
  const r=await fetch(`${SB_URL}/rest/v1/${path}`,{...opts,headers:{...headers,...(opts.headers||{})}});
  const text=await r.text(); if(!r.ok) throw new Error(text || r.statusText); return text?JSON.parse(text):null;
}
const auth=e=>(e.headers["x-admin-pin"]||e.headers["X-Admin-Pin"])===ADMIN_PIN;
exports.handler=async(event)=>{
  try{
    const q=event.queryStringParameters||{}, action=q.action||"bootstrap";
    if(action==="bootstrap"){
      const [products,zones,settings]=await Promise.all([
        sb("products?select=*&active=eq.true&order=id.asc"),
        sb("zones?select=*&active=eq.true&order=id.asc"),
        sb("settings?select=*&id=eq.1")
      ]);
      return j(200,{products,zones,settings:settings?.[0]||{}});
    }
    if(action==="order" && event.httpMethod==="POST"){
      const b=JSON.parse(event.body||"{}");
      if(!b.name||!b.phone||!b.address||!Array.isArray(b.items)||!b.items.length) return j(400,{error:"Incomplete order"});
      const id="BZ-"+String(Date.now()).slice(-6);
      const total=Number(b.subtotal||0)+Number(b.delivery_fee||0);
      await sb("orders",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({
        id,name:b.name,phone:b.phone,address:b.address,zone_id:b.zone_id,zone_name:b.zone_name,
        delivery_fee:b.delivery_fee,delivery_time:b.delivery_time,payment_ref:b.payment_ref||"",
        subtotal:b.subtotal,total,items:b.items,status:"Ð¨Ð¸Ð½Ñ",payment_status:"Ð¥Ò¯Ð»ÑÑÐ³Ð´ÑÐ¶ Ð±Ð°Ð¹Ð½Ð°"
      })});

      const itemLines=(b.items||[]).map(x=>`â€¢ ${x.name} Ã— ${x.qty} â€” ${Number(x.price)*Number(x.qty)}â‚®`).join("\n");
      await sendTelegram(
`ðŸ›Ž Ð¨Ð˜ÐÐ­ Ð—ÐÐ¥Ð˜ÐÐ›Ð“Ð
â„– ${id}
ÐÑÑ€: ${b.name}
Ð£Ñ‚Ð°Ñ: ${b.phone}
Ð‘Ò¯Ñ: ${b.zone_name||"-"}
Ð¥Ð°ÑÐ³: ${b.address}
Ð¥Ò¯Ñ€Ð³ÑÐ»Ñ‚: ${b.delivery_time||"-"}

${itemLines}

Ð‘Ð°Ñ€Ð°Ð°Ð½Ñ‹ Ð´Ò¯Ð½: ${Number(b.subtotal||0)}â‚®
Ð¥Ò¯Ñ€Ð³ÑÐ»Ñ‚: ${Number(b.delivery_fee||0)}â‚®
ÐÐ˜Ð™Ð¢: ${total}â‚®
Ð¢Ó©Ð»Ð±Ó©Ñ€: Ð¥Ò¯Ð»ÑÑÐ³Ð´ÑÐ¶ Ð±Ð°Ð¹Ð½Ð°`
      );

      return j(200,{id});
    }
    if(action==="track"){
      const rows=await sb(`orders?select=id,phone,zone_name,total,status,payment_status,delivery_time&id=eq.${encodeURIComponent(q.id||"")}&phone=eq.${encodeURIComponent(q.phone||"")}&limit=1`);
      return rows?.[0]?j(200,rows[0]):j(404,{error:"Ð—Ð°Ñ…Ð¸Ð°Ð»Ð³Ð° Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹"});
    }
    if(action==="admin_orders"){
      if(!auth(event)) return j(401,{error:"PIN Ð±ÑƒÑ€ÑƒÑƒ"});
      const rows=await sb("orders?select=*&order=created_at.desc&limit=200");
      return j(200,rows);
    }
    if(action==="admin_update" && event.httpMethod==="POST"){
      if(!auth(event)) return j(401,{error:"PIN Ð±ÑƒÑ€ÑƒÑƒ"});
      const b=JSON.parse(event.body||"{}");
      const rows=await sb(`orders?select=status,payment_status&id=eq.${encodeURIComponent(b.id)}&limit=1`);
      const o=rows?.[0]; if(!o) return j(404,{error:"Not found"});
      let patch={};
      if(b.op==="paid") patch.payment_status="Ð‘Ð°Ñ‚Ð°Ð»Ð³Ð°Ð°Ð¶ÑÐ°Ð½";
      if(b.op==="advance"){
        const list=["Ð¨Ð¸Ð½Ñ","Ð‘ÑÐ»Ñ‚Ð³ÑÐ¶ Ð±Ð°Ð¹Ð½Ð°","Ð¥Ò¯Ñ€Ð³ÑÐ»Ñ‚ÑÐ½Ð´ Ð³Ð°Ñ€ÑÐ°Ð½","Ð¥Ò¯Ñ€Ð³ÑÐ³Ð´ÑÑÐ½"];
        patch.status=list[Math.min(list.indexOf(o.status)+1,list.length-1)];
      }
      await sb(`orders?id=eq.${encodeURIComponent(b.id)}`,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify(patch)});
      return j(200,{ok:true});
    }
    return j(404,{error:"Unknown action"});
  }catch(e){return j(500,{error:e.message})}
};
