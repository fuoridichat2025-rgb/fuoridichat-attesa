export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/app' || url.pathname === '/' ) return appHtml();
    if (url.pathname === '/api/lista') {
      const { results } = await env.DB.prepare("SELECT * FROM utenti ORDER BY updated_at DESC LIMIT 300").all();
      return Response.json(results);
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(()=>null);
      const text = body?.channel_post?.text || body?.message?.text || '';
      if(!text) return new Response('ok');
      const p = parseLog(text);
      if(p) await salvaUtente(p, env.DB);
      return new Response('ok');
    }
    return new Response('FuoriDiChat Attesa Bot Online 🐢🔥');
  }
}
function parseLog(t){
  const idMain = (t.match(/#id(\d+)\b/)||[])[1];
  const nomeDi = (t.match(/Di: (.+?) \[/)||[])[1];
  const nomeA = (t.match(/A: (.+?) \[/)||[])[1];
  const idA = (t.match(/A:.*?\[(\d+)\]/)||[])[1];
  const invito = (t.match(/Link di: (.+?) \[/)||[])[1] || '';
  const motivo = (t.match(/Motivo: (.+?)(?:\n|•)/)||[])[1] || '';
  const approvato = (t.match(/Approvato da: (.+?) \[/)||[])[1] || '';
  const id = idA || idMain;
  const display = nomeA || nomeDi || 'Sconosciuto';
  if (t.includes('#RICHIESTA_INGRESSO')) return { tipo: 'RICHIESTA', id, display: nomeDi||display, invito };
  if (t.includes('#INGRESSO_UTENTE')) return { tipo: 'INGRESSO', id, display, approvatoDa: approvato };
  if (t.includes('#UNMUTA')) return { tipo: 'INGRESSO', id, display };
  if (t.includes('#USCITA_UTENTE')) return { tipo: 'USCITA', id, display };
  if (t.includes('#BAN')) return { tipo: 'BAN', id, display, motivo };
  if (t.includes('#KICK')) return { tipo: 'KICK', id, display, motivo };
  return null;
}
async function salvaUtente(p, DB){
  if(!p.id) return;
  const vecchio = await DB.prepare("SELECT * FROM utenti WHERE user_id=?").bind(p.id).first();
  const ora = new Date().toISOString();
  const pushStorico = (old, ev) => JSON.stringify([...JSON.parse(old?.storico||'[]'), {t:ora, ev}]);
  if(p.tipo==='RICHIESTA'){
    if(!vecchio){
      await DB.prepare("INSERT INTO utenti (user_id, display_name, stato, prima_richiesta, ultima_richiesta, invito_da, storico, updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(p.id, p.display, 'attesa', ora, ora, p.invito, pushStorico(null,'richiesta'), ora).run();
    } else {
      await DB.prepare("UPDATE utenti SET stato='attesa', ultima_richiesta=?, display_name=?, invito_da=?, storico=?, updated_at=? WHERE user_id=?").bind(ora, p.display, p.invito, pushStorico(vecchio,'richiesta-ritorno'), ora, p.id).run();
    }
  }
  if(p.tipo==='INGRESSO'){
    await DB.prepare("INSERT OR REPLACE INTO utenti (user_id, display_name, stato, prima_richiesta, ultima_richiesta, approvato_da, storico, updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(p.id, p.display, 'dentro', vecchio?.prima_richiesta||ora, ora, p.approvatoDa||'', pushStorico(vecchio,'dentro'), ora).run();
  }
  if(p.tipo==='USCITA'){
    await DB.prepare("UPDATE utenti SET stato='uscito', storico=?, updated_at=? WHERE user_id=?").bind(pushStorico(vecchio,'uscito'), ora, p.id).run();
  }
  if(p.tipo==='KICK' || p.tipo==='BAN'){
    await DB.prepare("UPDATE utenti SET stato='bannato', motivo=?, storico=?, updated_at=? WHERE user_id=?").bind(p.motivo||'', pushStorico(vecchio, (p.tipo==='KICK'?'kick: ':'ban: ')+(p.motivo||'')), ora, p.id).run();
  }
}
function appHtml(){
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;background:#f6f6f8;margin:0;padding:14px}h1{font-size:22px}.card{background:#fff;border-radius:18px;padding:14px;margin:12px 0;box-shadow:0 4px 16px #0001}.badge{font-size:11px;padding:4px 10px;border-radius:999px;font-weight:700}.attesa{background:#fff4c5}.dentro{background:#d6f5d6}.uscito{background:#e9e9ef}.bannato{background:#ffd1d1}.small{font-size:12px;color:#777;margin-top:6px}.search{width:100%;padding:12px;border-radius:14px;border:1px solid #ddd;margin-bottom:12px;box-sizing:border-box}</style></head><body><h1>👀 Chi deve fa' er vocale? 🎙️</h1><input id="q" class="search" placeholder="🔍 Cerca ID o nome..."><div id="list">Carico...</div><script>async function load(){const r=await fetch('/api/lista');const data=await r.json();const q=document.getElementById('q').value.toLowerCase();const f=data.filter(u=>!q||(u.display_name+u.user_id).toLowerCase().includes(q));document.getElementById('list').innerHTML=f.map(u=>{let e=u.stato==='attesa'?'⏳ In attesa vocale':u.stato==='dentro'?'✅ Dentro':u.stato==='uscito'?'🚪 Uscito':'🚷 Bannato/Kickato';let extra=u.stato==='attesa'&&u.prima_richiesta!==u.ultima_richiesta?'🤡 ATTENZIONE FURBETTO! Già visto prima<br>📅 Prima: '+new Date(u.prima_richiesta).toLocaleDateString():u.stato==='attesa'?'🆕 Prima volta ✨<br>📎 Invito da: '+(u.invito_da||'boh'):u.stato==='bannato'?'💀 Kick/Ban: '+(u.motivo||'')+'<br>Storico: '+JSON.parse(u.storico||'[]').length+' eventi':'👻 Era già stato dentro ed è uscito';return \`<div class="card"><b>🔥 \${u.display_name}</b><br><span class="small">🆔 \${u.user_id}</span><br><span class="badge \${u.stato}">\${e}</span><div class="small">\${extra}</div></div>\`}).join('')||'Nessuno in attesa rn 🙏';}document.getElementById('q').addEventListener('input',load);load();setInterval(load,5000);</script></body></html>`,{headers:{'Content-Type':'text/html'}});
}
