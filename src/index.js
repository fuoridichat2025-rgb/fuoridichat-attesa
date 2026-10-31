export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers });

    // WEBHOOK TELEGRAM - Fase 4
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const body = await request.json();
        const text = body?.message?.text || body?.channel_post?.text || "";
        
        // Parsa i log del canale: #RICHIESTA_INGRESSO #INGRESSO_UTENTE #UNMUTA #USCITA #BAN #KICK
        let stato = null;
        if (text.includes("#RICHIESTA_INGRESSO")) stato = "in_attesa";
        if (text.includes("#INGRESSO_UTENTE")) stato = "entrato";
        if (text.includes("#UNMUTA") || text.includes("#UNMUTE")) stato = "verificato";
        if (text.includes("#USCITA_UTENTE")) stato = "uscito";
        if (text.includes("#BAN")) stato = "bannato";
        if (text.includes("#KICK")) stato = "kickato";

        if (stato) {
          // Estrae user_id e username dal testo se presenti
          const matchId = text.match(/ID:?\s*(\d+)/i);
          const matchUser = text.match(/@(\w+)/);
          const user_id = matchId ? matchId[1] : Date.now().toString();
          const username = matchUser ? matchUser[1] : "sconosciuto";

          await env.DB.prepare(
            `INSERT INTO utenti (user_id, username, stato, creato_il, aggiornato_il) 
             VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
             ON CONFLICT(user_id) DO UPDATE SET stato=?3, username=?2, aggiornato_il=datetime('now')`
          ).bind(user_id, username, stato).run();
        }
        return new Response(JSON.stringify({ ok: true, parsed: stato }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // API UTENTI - Fase 3
    if (url.pathname === "/api/utenti") {
      const stato = url.searchParams.get("stato") || "in_attesa";
      const { results } = await env.DB.prepare(
        `SELECT *, 
         (julianday('now') - julianday(creato_il)) * 24 as ore_passate 
         FROM utenti WHERE stato = ?1 ORDER BY creato_il DESC LIMIT 100`
      ).bind(stato).all();
      return new Response(JSON.stringify(results), { headers: { ...headers, "Content-Type": "application/json" } });
    }

    // API TUTTI + STATS
    if (url.pathname === "/api/stats") {
      const { results } = await env.DB.prepare(
        `SELECT stato, COUNT(*) as tot FROM utenti GROUP BY stato`
      ).all();
      return new Response(JSON.stringify(results), { headers: { ...headers, "Content-Type": "application/json" } });
    }

    // ESTRAZIONE RANDOM
    if (url.pathname === "/api/esegui-estrazione") {
      const { results } = await env.DB.prepare(
        `SELECT * FROM utenti WHERE stato='in_attesa' ORDER BY RANDOM() LIMIT 1`
      ).all();
      return new Response(JSON.stringify(results[0] || null), { headers: { ...headers, "Content-Type": "application/json" } });
    }

    // DASHBOARD APP
    if (url.pathname === "/app" || url.pathname === "/") {
      return new Response(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>FuoriDiChat Attesa</title>
<style>
body{background:#0a0a0a;color:#fff;font-family:system-ui;padding:20px}
h1{font-size:28px} .card{background:#1a1a1a;border:1px solid #333;padding:15px;border-radius:12px;margin:10px 0}
.badge{padding:4px 8px;border-radius:99px;font-size:12px} .in_attesa{background:#f59e0b;color:#000}
.verificato{background:#10b981} .kickato{background:#ef4444} .entrato{background:#3b82f6}
input{width:100%;padding:12px;background:#111;border:1px solid #333;color:#fff;border-radius:8px;margin:10px 0}
</style>
</head>
<body>
<h1>👀 Chi si deve verificare? 🎙️</h1>
<input id="search" placeholder="Cerca @username...">
<div id="stats"></div>
<div id="lista">Carico...</div>
<script>
async function load(){
  const res = await fetch('/api/utenti?stato=in_attesa');
  const utenti = await res.json();
  const statsRes = await fetch('/api/stats');
  const stats = await statsRes.json();
  document.getElementById('stats').innerHTML = stats.map(s=>\`<span class="badge \${s.stato}">\${s.stato}: \${s.tot}</span> \`).join('');
  const q = document.getElementById('search').value.toLowerCase();
  const filtrati = utenti.filter(u=>u.username.toLowerCase().includes(q));
  document.getElementById('lista').innerHTML = filtrati.map(u=>{
    const ore = Math.floor(u.ore_passate||0);
    const rim = Math.max(0, 24-ore);
    return \`<div class="card"><b>@\${u.username}</b> <span class="badge \${u.stato}">\${u.stato}</span><br>
    <small>ID: \${u.user_id} - \${rim}h rimaste - entrato: \${u.creato_il}</small></div>\`
  }).join('') || '<p>Nessuno in attesa</p>';
}
document.getElementById('search').addEventListener('input', load);
load(); setInterval(load, 5000);
</script>
</body>
</html>`, { headers: { ...headers, "Content-Type": "text/html" } });
    }

    return new Response("FuoriDiChat Attesa v2 - OK", { headers });
  }
}
