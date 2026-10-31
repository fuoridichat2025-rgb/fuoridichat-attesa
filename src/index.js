export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // DASHBOARD
    if (url.pathname === "/app" || url.pathname === "/" ) {
      return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chi deve fa' er vocale?</title>
<style>
body{background:#0a0a0a;color:#fff;font-family:system-ui;padding:15px}
input{width:100%;padding:12px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;margin-bottom:12px}
.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:12px;margin-bottom:10px}
.badge{background:#ff3b3b;color:#fff;padding:3px 8px;border-radius:10px;font-size:12px}
small{color:#888}
</style>
</head>
<body>
<h2>👀 Chi deve fa' er vocale? 🎤</h2>
<input id="q" placeholder="Cerca @username...">
<button onclick="load()" style="width:100%;padding:10px;border-radius:10px;margin-bottom:15px">🔄 Aggiorna</button>
<div id="list"></div>
<script>
async function load(){
  const r = await fetch('/api/utenti'); const data = await r.json();
  const q = document.getElementById('q').value.toLowerCase();
  const filtered = data.filter(u => !q || (u.username && u.username.toLowerCase().includes(q)));
  document.getElementById('list').innerHTML = '<div style="margin-bottom:10px"><span style="background:#330000;padding:5px 10px;border-radius:10px;color:#ff6666">in_attesa: '+filtered.length+'</span></div>' +
    filtered.map(u => {
      const prima = new Date(u.prima_richiesta);
      const diff = Math.floor((Date.now() - prima.getTime())/1000/3600);
      const rimaste = Math.max(0, 24 - diff);
      return '<div class=card><b>@'+(u.username||'senza_username')+'</b> <span class=badge>in_attesa</span><br><small>ID:'+u.user_id+' - '+rimaste+'h rimaste - prima: '+u.prima_richiesta+'<br>ultima: '+u.ultima_richiesta+'</small></div>';
    }).join('') || '<div style="text-align:center;color:#666;margin-top:30px">Nessuno in attesa ✅</div>';
}
document.getElementById('q').addEventListener('input', load);
load();
setInterval(load, 30000);
</script>
</body>
</html>
      `, { headers: { "Content-Type": "text/html" }});
    }

    if (url.pathname === "/api/utenti") {
      const { results } = await env.DB.prepare("SELECT * FROM utenti WHERE stato='in_attesa' ORDER BY prima_richiesta DESC").all();
      return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }});
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
