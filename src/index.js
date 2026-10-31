export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // WEBHOOK TELEGRAM - logga #RICHIESTA_INGRESSO ecc
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const body = await request.json();
        const text = body?.message?.text || body?.channel_post?.text || body?.text || JSON.stringify(body);
        let stato = null;
        if (text.includes("#RICHIESTA_INGRESSO")) stato = "in_attesa";
        if (text.includes("#INGRESSO_UTENTE") || text.includes("#INGRESSO")) stato = "entrato";
        if (text.includes("#UNMUTA") || text.includes("#UNMUTE")) stato = "verificato";
        if (text.includes("#USCITA_UTENTE")) stato = "uscito";
        if (text.includes("#BAN")) stato = "bannato";
        if (text.includes("#KICK")) stato = "kickato";
        if (!stato) return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: cors });

        const mId = text.match(/ID:?\s*(\d+)/i);
        const mUser = text.match(/@(\w+)/);
        const user_id = mId ? parseInt(mId[1]) : Date.now();
        const display_name = mUser ? mUser[1] : "sconosciuto";

        await env.DB.prepare(
          `INSERT INTO utenti (user_id, display_name, stato, prima_richiesta, ultima_richiesta, updated_at, storico)
           VALUES (?1, ?2, ?3, datetime('now'), datetime('now'), datetime('now'), ?4)
           ON CONFLICT(user_id) DO UPDATE SET stato=?3, display_name=?2, ultima_richiesta=datetime('now'), updated_at=datetime('now'), storico=COALESCE(storico,'') || '\n' || ?4`
        ).bind(user_id, display_name, stato, text.slice(0,500)).run();

        return new Response(JSON.stringify({ ok: true, stato, user_id }), { headers: cors });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
      }
    }

    // API UTENTI
    if (url.pathname === "/api/utenti") {
      const stato = url.searchParams.get("stato") || "in_attesa";
      const { results } = await env.DB.prepare(
        `SELECT *, (julianday('now') - julianday(prima_richiesta))*24 as ore_passate FROM utenti WHERE stato=?1 ORDER BY ultima_richiesta DESC LIMIT 100`
      ).bind(stato).all();
      return new Response(JSON.stringify(results), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/api/stats") {
      const { results } = await env.DB.prepare(`SELECT stato, COUNT(*) as tot FROM utenti GROUP BY stato`).all();
      return new Response(JSON.stringify(results), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/api/esegui-estrazione") {
      const { results } = await env.DB.prepare(`SELECT * FROM utenti WHERE stato='in_attesa' ORDER BY RANDOM() LIMIT 1`).all();
      return new Response(JSON.stringify(results[0]||null), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // APP DASHBOARD
    if (url.pathname.startsWith("/app") || url.pathname === "/") {
      return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FuoriDiChat Attesa</title>
<style>body{background:#0a0a0a;color:#fff;font-family:system-ui;padding:18px}h1{font-size:26px}.card{background:#161616;border:1px solid #2a2a2a;padding:14px;border-radius:12px;margin:10px 0}.badge{padding:4px 8px;border-radius:99px;font-size:12px}.in_attesa{background:#f59e0b;color:#000}.entrato{background:#3b82f6}.verificato{background:#10b981}.bannato,.kickato{background:#ef4444}input,button{width:100%;padding:12px;background:#111;border:1px solid #333;color:#fff;border-radius:8px;margin:8px 0}button{background:#fff;color:#000;font-weight:700}</style>
</head><body>
<h1>👀 Chi deve fa' er vocale? 🎙️</h1>
<input id="search" placeholder="Cerca @username...">
<button onclick="load()">🔄 Aggiorna</button>
<div id="stats" style="margin:10px 0"></div>
<div id="lista">Carico...</div>
<script>
async function load(){
  const r=await fetch('/api/utenti?stato=in_attesa'); const utenti=await r.json();
  const rs=await fetch('/api/stats'); const stats=await rs.json();
  document.getElementById('stats').innerHTML=stats.map(s=>\`<span class="badge \${s.stato}">\${s.stato}: \${s.tot}</span> \`).join('');
  const q=document.getElementById('search').value.toLowerCase();
  const f=utenti.filter(u=>(u.display_name||'').toLowerCase().includes(q));
  document.getElementById('lista').innerHTML=f.map(u=>{
    const ore=Math.floor(u.ore_passate||0); const rim=Math.max(0,24-ore);
    return \`<div class="card"><b>@\${u.display_name}</b> <span class="badge \${u.stato}">\${u.stato}</span><br><small>ID:\${u.user_id} - \${rim}h rimaste - prima: \${u.prima_richiesta}<br>ultima: \${u.ultima_richiesta}</small></div>\`
  }).join('')||'<p>Nessuno in attesa - tabella vuota, collega il webhook!</p>';
}
document.getElementById('search').addEventListener('input',load); load(); setInterval(load,5000);
</script></body></html>`, { headers: { ...cors, "Content-Type": "text/html" } });
    }
    return new Response("FuoriDiChat v2 OK", { headers: cors });
  }
}
