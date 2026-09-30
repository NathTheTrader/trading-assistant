(function(){
  const css=document.createElement("style");
  css.textContent=`
  .ta-voice-fab{
    position:fixed;right:20px;bottom:20px;z-index:9999;
    display:flex;align-items:center;gap:9px;
    border:1px solid rgba(255,43,43,.34);
    background:linear-gradient(145deg,#11161d,#090d12);
    color:#fff;border-radius:12px;padding:10px 13px;
    font:800 10px/1 "Manrope","Inter",sans-serif;letter-spacing:.9px;
    box-shadow:0 14px 35px rgba(0,0,0,.45),0 0 24px rgba(255,43,43,.07);
    transition:.18s;
  }
  .ta-voice-fab:hover{transform:translateY(-2px);border-color:rgba(255,43,43,.55);box-shadow:0 18px 42px rgba(0,0,0,.5),0 0 30px rgba(255,43,43,.11)}
  .ta-voice-fab .ta-fab-orb{
    width:9px;height:9px;border-radius:50%;background:#ff2b2b;
    box-shadow:0 0 14px rgba(255,43,43,.75)
  }
  body.crypto-mode .ta-voice-fab{border-color:rgba(47,140,255,.38)}
  body.crypto-mode .ta-voice-fab .ta-fab-orb{background:#2f8cff;box-shadow:0 0 14px rgba(47,140,255,.75)}
  .ta-voice-panel{
    position:fixed;right:20px;bottom:74px;width:430px;max-width:calc(100vw - 24px);
    z-index:9998;overflow:hidden;
    background:linear-gradient(160deg,rgba(12,16,22,.985),rgba(7,10,14,.985));
    border:1px solid rgba(255,255,255,.10);border-radius:16px;
    color:#fff;box-shadow:0 28px 90px rgba(0,0,0,.68),0 0 0 1px rgba(255,255,255,.015);
    backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);
  }
  .ta-voice-head{padding:15px 16px 12px;border-bottom:1px solid rgba(255,255,255,.065);background:linear-gradient(180deg,rgba(255,255,255,.025),transparent)}
  .ta-voice-top{display:flex;justify-content:space-between;align-items:center;gap:12px}
  .ta-voice-brand{display:flex;align-items:center;gap:10px}
  .ta-voice-orb{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,43,43,.30);background:radial-gradient(circle at 50% 42%,rgba(255,43,43,.15),transparent 66%),#0a0d12}
  .ta-voice-orb i{width:8px;height:8px;border-radius:50%;display:block;background:#ff2b2b;box-shadow:0 0 14px #ff2b2b}
  body.crypto-mode .ta-voice-orb{border-color:rgba(47,140,255,.33);background:radial-gradient(circle at 50% 42%,rgba(47,140,255,.16),transparent 66%),#0a0d12}
  body.crypto-mode .ta-voice-orb i{background:#2f8cff;box-shadow:0 0 14px #2f8cff}
  .ta-voice-kicker{font:900 8px/1 "Inter",sans-serif;letter-spacing:1.55px;color:#687382;margin-bottom:4px}
  .ta-voice-title{font:900 15px/1 "Manrope","Inter",sans-serif;letter-spacing:-.15px}
  .ta-voice-title span{font-size:9px;letter-spacing:1px;color:#8f9aaa;margin-left:6px}
  .ta-voice-close{background:transparent;border:0;color:#667282;font-size:20px;line-height:1;padding:2px 4px}
  .ta-voice-close:hover{color:#fff}
  .ta-voice-tabs{display:flex;gap:3px;padding:3px;margin-top:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);border-radius:8px}
  .ta-voice-tab{flex:1;border:0;background:transparent;color:#6f7b89;border-radius:6px;padding:8px 10px;font:900 9px/1 "Inter",sans-serif;letter-spacing:.8px}
  .ta-voice-tab.active{background:rgba(255,43,43,.10);color:#fff;box-shadow:inset 0 0 0 1px rgba(255,43,43,.24)}
  body.crypto-mode .ta-voice-tab.active{background:rgba(47,140,255,.11);box-shadow:inset 0 0 0 1px rgba(47,140,255,.26)}
  .ta-voice-body{padding:13px 14px 14px}
  .ta-voice-context{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
  .ta-voice-chip{padding:5px 7px;border-radius:5px;background:rgba(255,255,255,.027);border:1px solid rgba(255,255,255,.065);color:#8d98a6;font:800 8px/1 "Inter",sans-serif;letter-spacing:.7px}
  .ta-voice-chip.accent{color:#ff7676;border-color:rgba(255,43,43,.17);background:rgba(255,43,43,.055)}
  body.crypto-mode .ta-voice-chip.accent{color:#74b1ff;border-color:rgba(47,140,255,.18);background:rgba(47,140,255,.055)}
  .ta-voice-state{display:grid;grid-template-columns:42px 1fr;gap:11px;align-items:center;padding:11px;border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.018);border-radius:11px}
  .ta-state-orb{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#090c11;border:1px solid rgba(255,255,255,.08)}
  .ta-state-orb i{width:11px;height:11px;border-radius:50%;background:#586474;box-shadow:0 0 0 rgba(255,43,43,0)}
  .ta-voice-panel[data-state="listening"] .ta-state-orb{border-color:rgba(255,43,43,.38);box-shadow:0 0 25px rgba(255,43,43,.10)}
  .ta-voice-panel[data-state="listening"] .ta-state-orb i{background:#ff2b2b;box-shadow:0 0 18px rgba(255,43,43,.9);animation:taPulse 1.15s ease-in-out infinite}
  body.crypto-mode .ta-voice-panel[data-state="listening"] .ta-state-orb{border-color:rgba(47,140,255,.38);box-shadow:0 0 25px rgba(47,140,255,.10)}
  body.crypto-mode .ta-voice-panel[data-state="listening"] .ta-state-orb i{background:#2f8cff;box-shadow:0 0 18px rgba(47,140,255,.9)}
  .ta-voice-panel[data-state="thinking"] .ta-state-orb i{background:#ffb84d;box-shadow:0 0 16px rgba(255,184,77,.8);animation:taThink 1s linear infinite}
  .ta-state-copy b{display:block;font:900 10px/1 "Inter",sans-serif;letter-spacing:.6px}
  .ta-state-copy span{display:block;margin-top:5px;color:#748090;font-size:10px;line-height:1.45}
  .ta-wave{display:flex;align-items:center;gap:3px;height:18px;margin-top:7px}
  .ta-wave i{width:2px;height:6px;border-radius:3px;background:#515d6d;opacity:.7}
  .ta-voice-panel[data-state="listening"] .ta-wave i{background:var(--accent,#ff2b2b);animation:taWave .8s ease-in-out infinite alternate}
  .ta-wave i:nth-child(2){animation-delay:.06s}.ta-wave i:nth-child(3){animation-delay:.12s}.ta-wave i:nth-child(4){animation-delay:.18s}.ta-wave i:nth-child(5){animation-delay:.24s}.ta-wave i:nth-child(6){animation-delay:.30s}.ta-wave i:nth-child(7){animation-delay:.36s}.ta-wave i:nth-child(8){animation-delay:.42s}
  @keyframes taPulse{50%{transform:scale(1.25)}}@keyframes taThink{to{transform:rotate(360deg)}}@keyframes taWave{to{height:17px;opacity:1}}
  .ta-voice-convo{margin-top:10px;max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:7px}
  .ta-voice-msg{padding:9px 10px;border-radius:9px;font-size:10px;line-height:1.55;border:1px solid rgba(255,255,255,.06)}
  .ta-voice-msg .who{font:900 8px/1 "Inter",sans-serif;letter-spacing:1px;color:#697586;margin-bottom:5px}
  .ta-voice-msg.user{background:rgba(255,255,255,.024);align-self:flex-end;max-width:92%}
  .ta-voice-msg.ai{background:color-mix(in srgb,var(--accent,#ff2b2b) 6%,transparent);border-color:color-mix(in srgb,var(--accent,#ff2b2b) 12%,transparent);align-self:flex-start;max-width:94%}
  .ta-voice-qa{margin-top:10px;padding:10px 11px;border:1px solid rgba(255,255,255,.07);background:#090c11;border-radius:10px}
  .ta-voice-qa .qa-label{font:900 8px/1 "Inter",sans-serif;letter-spacing:1px;color:#697586;margin-bottom:6px}
  .ta-voice-qa .qa-text{font-size:11px;line-height:1.55;color:#e7ecf3}
  .ta-voice-answer{margin-top:9px;padding:10px 11px;border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.018);border-radius:10px;font-size:10px;line-height:1.55;color:#bfc8d4}
  .ta-voice-actions{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:6px;margin-top:10px}
  .ta-voice-actions button{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.025);color:#eaf0f7;border-radius:8px;padding:9px 8px;font:900 8px/1 "Inter",sans-serif;letter-spacing:.7px}
  .ta-voice-actions .primary{background:linear-gradient(135deg,#ff3030,#df1019);border-color:rgba(255,70,70,.18)}
  body.crypto-mode .ta-voice-actions .primary{background:linear-gradient(135deg,#2f8cff,#1769e8);border-color:rgba(80,160,255,.20)}
  .ta-voice-status{margin-top:8px;font-size:8px;line-height:1.45;color:#667282;text-align:center}
  .ta-voice-foot{display:flex;justify-content:space-between;gap:8px;padding:9px 13px;border-top:1px solid rgba(255,255,255,.055);color:#556172;font-size:8px;letter-spacing:.6px}
  .ta-voice-foot strong{color:#7d8897}
  @media(max-width:600px){.ta-voice-panel{right:10px;bottom:68px;width:calc(100vw - 20px)}.ta-voice-fab{right:12px;bottom:12px}.ta-voice-actions{grid-template-columns:1fr 1fr}.ta-voice-actions #taDaily{grid-column:1/-1}}
  `;
  document.head.appendChild(css);

  let panel,button,recorder,stream,chunks=[],turns=[];
  const api=()=>String(localStorage.getItem("botApiUrl")||"https://trading-assistant-production.up.railway.app").replace(/\/$/,"");
  const model=()=>String(localStorage.getItem("activeModel")||"NQ").toUpperCase()==="CRYPTO"?"CRYPTO":"NQ";
  const access=()=>String(localStorage.getItem("edgeflowAccessKey")||"");
  const headers=()=>{const h={"Content-Type":"application/json"};const k=access();if(k)h["X-EDGEFLOW-ACCESS"]=k;return h};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const modelLabel=()=>model()==="CRYPTO"?"CRYPTO":"FUTURES";
  const modelAccent=()=>model()==="CRYPTO"?"#2f8cff":"#ff2b2b";

  function setState(state,text){
    if(!panel)return;
    panel.dataset.state=state||"idle";
    const title=panel.querySelector("#taStateTitle"),copy=panel.querySelector("#taStateCopy");
    if(title)title.textContent=text||"JARVIS PRÊT";
    if(copy)copy.textContent=state==="listening"?"Micro actif · parle naturellement puis appuie sur STOP.":state==="thinking"?"Transcription, mémoire et analyse du modèle actif…":"Une seule question à la fois · lecture seule";
  }
  function render(){
    if(!panel)return;
    const m=modelLabel(),accent=m==="CRYPTO"?"CRYPTO":"FUTURES";
    panel.style.setProperty("--accent",modelAccent());
    panel.innerHTML=`
      <div class="ta-voice-head">
        <div class="ta-voice-top">
          <div class="ta-voice-brand">
            <div class="ta-voice-orb"><i></i></div>
            <div><div class="ta-voice-kicker">EDGEFLOW AI COMMAND CENTER</div><div class="ta-voice-title">JARVIS <span>${accent} CORE</span></div></div>
          </div>
          <button class="ta-voice-close" id="taClose" aria-label="Fermer">×</button>
        </div>
        <div class="ta-voice-tabs">
          <button class="ta-voice-tab ${m==="FUTURES"?"active":""}" id="taModelF" type="button">FUTURES</button>
          <button class="ta-voice-tab ${m==="CRYPTO"?"active":""}" id="taModelC" type="button">CRYPTO</button>
        </div>
      </div>
      <div class="ta-voice-body">
        <div class="ta-voice-context">
          <span class="ta-voice-chip accent">${m} MODEL</span>
          <span class="ta-voice-chip">${m==="FUTURES"?"HTF · POI · SWEEP · R.B.":"DIRECTION · KEY OPEN · HTF POI"}</span>
          <span class="ta-voice-chip">READ ONLY</span>
        </div>
        <div class="ta-voice-state">
          <div class="ta-state-orb"><i></i></div>
          <div class="ta-state-copy"><b id="taStateTitle">JARVIS PRÊT</b><span id="taStateCopy">Une seule question à la fois · lecture seule</span><div class="ta-wave">${Array.from({length:8},()=>"<i></i>").join("")}</div></div>
        </div>
        <div class="ta-voice-qa"><div class="qa-label">QUESTION ACTIVE</div><div id="taVQ" class="qa-text">Appuie sur « QUESTION » pour que JARVIS choisisse le point le plus utile à traiter pour ${m}.</div></div>
        <div id="taConvo" class="ta-voice-convo"></div>
        <div id="taVA" class="ta-voice-answer" style="display:none"></div>
        <div class="ta-voice-actions">
          <button id="taTalk" class="primary" type="button">◉ PARLER</button>
          <button id="taDaily" type="button">REVUE DU JOUR</button>
        </div>
        <div id="taVS" class="ta-voice-status">JARVIS utilise uniquement le contexte ${m}.</div>
      </div>
      <div class="ta-voice-foot"><span>EDGEFLOW · ${m}</span><strong>IA séparée par modèle</strong></div>`;
    panel.querySelector("#taClose").onclick=()=>{panel.style.display="none";stopRecording()};
    panel.querySelector("#taModelF").onclick=()=>setVoiceModel("NQ");
    panel.querySelector("#taModelC").onclick=()=>setVoiceModel("CRYPTO");
    panel.querySelector("#taTalk").onclick=toggle;
    panel.querySelector("#taDaily").onclick=daily;
    setState("idle","JARVIS PRÊT");
    renderConversation();
  }

  function renderConversation(){
    const box=panel?.querySelector("#taConvo");if(!box)return;
    box.innerHTML=turns.slice(-8).map(t=>'<div class="ta-voice-msg '+(t.role==="user"?"user":"ai")+'"><div class="who">'+(t.role==="user"?"TOI":"JARVIS")+'</div>'+esc(t.content)+'</div>').join("");
    box.scrollTop=box.scrollHeight;
    const answer=panel.querySelector("#taVA");
    if(answer){const last=turns.slice(-1)[0];if(last?.role==="assistant"){answer.style.display="block";answer.textContent=last.content}else answer.style.display="none";}
  }
  function setStatus(t){const x=panel?.querySelector("#taVS");if(x)x.textContent=t}
  function setVoiceModel(m){
    if(window.stopObserver){} // no-op; keep market observers untouched.
    localStorage.setItem("activeModel",m);localStorage.setItem("siteMode",m);
    if(typeof window.setSiteMode==="function") window.setSiteMode(m);
    render();
    setStatus("JARVIS bascule sur le contexte "+modelLabel()+".");
  }
  async function start(){
    if(!api()){setStatus("Backend IA non configuré.");return}
    setState("thinking","JARVIS CHERCHE");
    setStatus("Recherche de la question la plus utile pour "+modelLabel()+"…");
    try{
      const r=await fetch(api()+"/api/coach/question",{method:"POST",headers:headers(),body:JSON.stringify({model:model()})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur backend");
      const q=String(d.question||"").trim();
      panel.querySelector("#taVQ").textContent=q||"Aucune question générée.";
      setState("idle","QUESTION ACTIVE");
      setStatus("Question prête · réponse vocale disponible.");
      speak(q);
    }catch(e){setState("idle","JARVIS PRÊT");setStatus("Erreur vocale : "+(e?.message||"réessaie."))}
  }
  async function daily(){
    if(!api()){setStatus("Backend IA non configuré.");return}
    setState("thinking","JARVIS ANALYSE");
    setStatus("Analyse des données "+modelLabel()+"…");
    try{
      const r=await fetch(api()+"/api/optimization/daily?model="+encodeURIComponent(model()),{headers:headers()});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur backend");
      const text=String(d.text||"Aucune conclusion.");
      turns.push({role:"assistant",content:text});turns=turns.slice(-12);renderConversation();
      setState("idle","REVUE TERMINÉE");setStatus("Revue du jour terminée · modèle "+modelLabel()+".");
      speak(text);
    }catch(e){setState("idle","JARVIS PRÊT");setStatus(e.message)}
  }
  function chooseBrowserVoice(){
    if(!("speechSynthesis" in window))return null;
    const voices=window.speechSynthesis.getVoices()||[];
    if(!voices.length)return null;
    const score=v=>{
      const n=String(v.name||"").toLowerCase(),l=String(v.lang||"").toLowerCase();
      let sc=0;
      if(/^fr(-|_)/.test(l))sc+=28;
      if(/canada|français|french/.test(n))sc+=16;
      if(/male|homme|david|george|thomas|paul|ryan|olivier/.test(n))sc+=7;
      if(/microsoft|google/.test(n))sc+=2;
      if(/female|femme|susan|zira|sophie/.test(n))sc-=8;
      if(!v.localService)sc+=1;
      return sc;
    };
    return voices.slice().sort((a,b)=>score(b)-score(a))[0]||null;
  }
  function speak(t){
    if(!("speechSynthesis" in window))return;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(String(t||""));
    u.lang="fr-CA";
    const voice=chooseBrowserVoice();if(voice)u.voice=voice;
    u.rate=.91;u.pitch=.84;u.volume=1;
    window.speechSynthesis.speak(u);
  }
  if("speechSynthesis" in window)window.speechSynthesis.onvoiceschanged=()=>chooseBrowserVoice();
  function mime(){const a=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"];return a.find(x=>window.MediaRecorder?.isTypeSupported(x))||""}
  async function toggle(){
    if(recorder?.state==="recording"){recorder.stop();return}
    if(!api()){setStatus("Backend IA non configuré.");return}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setStatus("Micro non disponible dans ce navigateur.");return}
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const m=mime();recorder=m?new MediaRecorder(stream,{mimeType:m}):new MediaRecorder(stream);
      chunks=[];
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
      recorder.onstop=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;send(new Blob(chunks,{type:recorder.mimeType||m||"audio/webm"}));};
      recorder.start();
      panel.querySelector("#taTalk").textContent="■ STOP";
      setState("listening","JARVIS ÉCOUTE");
      setStatus("Parle maintenant. Reclique sur PARLER quand tu as terminé.");
    }catch(e){setState("idle","JARVIS PRÊT");setStatus("Micro refusé : "+e.message)}
  }
  function stopRecording(){
    try{if(recorder?.state==="recording")recorder.stop()}catch{}
    try{stream?.getTracks().forEach(t=>t.stop())}catch{}
    stream=null;
  }
  async function send(blob){
    panel.querySelector("#taTalk").textContent="◉ PARLER";
    setState("thinking","JARVIS TRAITE");
    setStatus("Transcription + analyse "+modelLabel()+"…");
    const b=await blob.arrayBuffer();let s="",u=new Uint8Array(b);
    for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));
    try{
      const r=await fetch(api()+"/api/voice/turn",{method:"POST",headers:headers(),body:JSON.stringify({model:model(),audioBase64:btoa(s),mimeType:blob.type,previousTurns:turns.slice(-12)})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur backend");
      turns.push({role:"user",content:String(d.transcript||"")},{role:"assistant",content:String(d.reply||"")});
      turns=turns.slice(-12);renderConversation();
      panel.querySelector("#taVQ").textContent=d.reply||"Réponse reçue.";
      setState("idle","RÉPONSE PRÊTE");setStatus("JARVIS répond selon le modèle "+modelLabel()+".");
      if(d.audioBase64){
        const a=new Audio("data:"+(d.audioMimeType||"audio/mpeg")+";base64,"+d.audioBase64);
        a.play().catch(()=>speak(d.reply||""));
      }else speak(d.reply||"");
    }catch(e){setState("idle","JARVIS PRÊT");setStatus(e.message)}
  }
  function init(){
    button=document.createElement("button");
    button.className="ta-voice-fab";
    button.type="button";
    button.innerHTML='<span class="ta-fab-orb"></span><span>JARVIS</span><span id="taFabMode">'+modelLabel()+'</span>';
    document.body.appendChild(button);
    panel=document.createElement("div");panel.className="ta-voice-panel";panel.style.display="none";panel.dataset.state="idle";document.body.appendChild(panel);
    button.onclick=()=>{panel.style.display=panel.style.display==="none"?"block":"none";if(panel.style.display==="block")render();};
    window.addEventListener("edgeflow:model-change",()=>{if(panel.style.display==="block")render();const x=button?.querySelector("#taFabMode");if(x)x.textContent=modelLabel();});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();