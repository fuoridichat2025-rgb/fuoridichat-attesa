export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/app" || url.pathname === "/") {
      return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chi deve fa' er vocale?</title>
<style>
body{background:#0a0a0a;color:#fff;font-family:system-ui;padding:15px}
input{width:100%;padding:12px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;margin-bottom:12px;box-sizing:border-box}
.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.badge{background:#ff3b3b;color:#fff;padding:3px 8px;border-radius:10px;font-size:12px}
small{color:#888}
.btn{padding:8px 14px;border-radius:8px;border:0;font-weight:bold;cursor:pointer}
.btn-green{background:#00c851;color:#fff}
.btn-blue{background:#1a73e8;color:#fff;width:100%;padding:12px;border-radius:10px;margin-bottom:15px}
</style></head><body>
<h2>👀 Chi deve fa' er vocale? 🎤</h2>
<input id="q" placeholder="Cerca @username...">
<button class="btn-blue" onclick="load()">🔄 Aggiorna lista</button>
<div id="list">Carico...</div>
<script>
async function delUser(id){
 if(!confirm('Togliere ID '+id+' dalla lista?')) return;
 await fetch('/api/delete?id='+id,{method:'DELETE'});
 load();
}
async function load(){
 try{
  const r = await fetch('/api/utenti'); const data = await r.json();
  const q = document.getElementById('q').value.toLowerCase();
  const filtered = data.filter(u => !q || (u.username && u.username.toLowerCase().includes(q)) || String(u.user_id).includes(q));
  if(filtered.length===0){document.getElementById('list').innerHTML='<div style="text-align:center;color:#666;margin-top:30px">Nessuno in attesa ✅<br><small>Scrivi #RICHIESTA_INGRESSO nel canale log per testare</small></div>'; return;}
  document.getElementById('list').innerHTML = '<div style="margin-bottom:10px"><span style="background:#330000;padding:5px 10px;border-radius:10px;color:#ff6666">in_attesa: '+filtered.length+'</span></div>' +
    filtered.map(u => {
      const prima = new Date(u.prima_richiesta);
      const diff = Math.floor((Date.now() - prima.getTime())/1000/3600);
      const rimaste = Math.max(0, 24 - diff);
      return '<div class=card><div><b>@'+(u.username||'senza_username')+'</b> <span class=badge>in_attesa</span><br><small>ID:'+u.user_id+' - '+rimaste+'h rimaste<br>'+u.prima_richiesta+'</small></div><div><button class=btn-green onclick="delUser('+u.user_id+')">✅ Fatto</button></div></div>';
    }).join('');
 }catch(e){document.getElementById('list').innerHTML='Errore: '+e.message}
}
document.getElementById('q').addEventListener('input', load);
load();
</script></body></html>`, {headers:{"Content-Type":"text/html"}});
    }

    if (url.pathname === "/api/utenti") {
      const { results } = await env.DB.prepare("SELECT * FROM utenti WHERE stato='in_attesa' ORDER BY prima_richiesta DESC").all();
      return new Response(JSON.stringify(results), {headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
    }
    
    if (url.pathname === "/api/delete") {
      const id = url.searchParams.get("id");
      if(id){ await env.DB.prepare("DELETE FROM utenti WHERE user_id = ?").bind(parseInt(id)).run(); }
      return new Response("ok", {headers:{"Access-Control-Allow-Origin":"*"}});
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const update = await request.json();
        const text = update.channel_post?.text || update.message?.text || "";
        const idMatch = text.match(/ID:\s*(\d+)/i);
        const userMatch = text.match(/@([a-zA-Z0-9_]+)/);
        if (!idMatch) return new Response("no id", {status: 200});
        const user_id = parseInt(idMatch[1]);
        const username = userMatch ? userMatch[1] : null;
        const lower = text.toLowerCase();
        if (lower.includes("richiesta")) {
          const now = new Date().toISOString().slice(0,19).replace("T"," ");
          await env.DB.prepare("INSERT INTO utenti (user_id, username, stato, prima_richiesta, ultima_richiesta) VALUES (?, ?, 'in_attesa', ?, ?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, ultima_richiesta=excluded.ultima_richiesta, stato='in_attesa'").bind(user_id, username, now, now).run();
        } else if (lower.includes("unmuta") || lower.includes("unmute") || lower.includes("kick") || lower.includes("ban") || lower.includes("sban") || lower.includes("approv")) {
          await env.DB.prepare("DELETE FROM utenti WHERE user_id = ?").bind(user_id).run();
        }
        return new Response("ok", {status: 200});
      } catch(e){ return new Response("error "+e.message, {status:500}); }
    }
    return new Response("Not found", {status: 404});
  }
}
