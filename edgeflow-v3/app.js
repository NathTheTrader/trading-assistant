/* EDGEFLOW V8 — reference-driven terminal rebuild */
(() => {
  "use strict";
  const root = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const savedMode = localStorage.getItem("edgeflow-mode");
  const savedView = localStorage.getItem("edgeflow-view");
  const validMode = ["NQ","CRYPTO"].includes(savedMode) ? savedMode : "";
  const validViews = ["overview","trades","performance","ai","journal","analytics","backtests","connections","settings"];
  const requestedMode = q.get("mode")==="CRYPTO" ? "CRYPTO" : q.get("mode")==="NQ" ? "NQ" : validMode;
  const requestedView = q.get("view") || savedView || "overview";
  const journalKey=mode=>"edgeflow-journal:"+mode;
  const loadJournal=mode=>{
    if(!mode) return [];
    try{
      let raw=localStorage.getItem(journalKey(mode));
      // Migrate the previous single-journal key once into Futures, then keep environments isolated.
      if(!raw && mode==="NQ"){
        const legacy=localStorage.getItem("edgeflow-journal");
        if(legacy){ raw=legacy; localStorage.setItem(journalKey(mode),legacy); localStorage.removeItem("edgeflow-journal"); }
      }
      const parsed=raw?JSON.parse(raw):[];
      return Array.isArray(parsed)?parsed:[];
    }catch(_){
      localStorage.removeItem(journalKey(mode));
      return [];
    }
  };
  const state = {
    filters:{query:"",side:"ALL",instrument:"ALL",setup:"ALL"},
    mode: requestedMode,
    view: validViews.includes(requestedView) ? requestedView : "overview",
    journal: loadJournal(requestedMode),
    activeBacktest: null,
    tradovate:{status:null,loading:false,lastFetch:0,error:""},
    kcex:{running:false,processing:false,stream:null,video:null,canvas:null,previousImage:"",events:[],lastDetected:null,error:"",timer:null},
    aiTurns:[]
  };
  const DATA = {
    NQ:{label:"FUTURES",accent:"red",instruments:["MNQ","MES","MGC"],connections:["Tradovate","Rithmic"]},
    CRYPTO:{label:"CRYPTO",accent:"blue",instruments:["BTC","ETH","SOL","BNB","XRP","HYPE","FLOKI"],connections:["KCEX"]}
  };
  const API_BASE="https://trading-assistant-production.up.railway.app";
  const d=()=>DATA[state.mode||"NQ"];
  const crypto=()=>state.mode==="CRYPTO";
  const accent=()=>crypto()?"blue":"red";
  const now=()=>new Date().toLocaleTimeString("en-CA",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const setupOptions=()=>crypto()?["Key Open Sweep","HTF POI","Liquidity Sweep","Entry Location","High-RR","Other"]:["R.B + FVG","Rejection Block","Sweep + OB","10H Open","FVG","Trend"];
  const sessionOptions=()=>crypto()?["24/7","Asia","London","NY AM","NY PM"]:["London","Asia","NY AM","NY PM"];
  const modelLabel=()=>crypto()?"Crypto":"Futures / NQ";
  const statsFromJournal=(entries=state.journal)=>{
    const xs=Array.isArray(entries)?entries:[];
    const pnls=xs.map(x=>Number(x.pnl)).filter(Number.isFinite);
    const wins=pnls.filter(x=>x>0),losses=pnls.filter(x=>x<0);
    const grossWin=wins.reduce((a,b)=>a+b,0),grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
    const rr=xs.map(x=>Number(x.rr)).filter(Number.isFinite);
    let run=0,peak=0,maxDD=0;
    for(const p of pnls){run+=p;peak=Math.max(peak,run);maxDD=Math.max(maxDD,peak-run);}
    const today=new Date().toISOString().slice(0,10);
    const todayPnl=xs.filter(x=>String(x.date||"").slice(0,10)===today).reduce((a,x)=>a+(Number(x.pnl)||0),0);
    return {count:xs.length,wins:wins.length,losses:losses.length,winRate:xs.length?wins.length/xs.length:null,pf:grossLoss?grossWin/grossLoss:(grossWin?Infinity:null),avgRR:rr.length?rr.reduce((a,b)=>a+b,0)/rr.length:null,total:pnls.reduce((a,b)=>a+b,0),todayPnl,maxDD};
  };
  const pct=n=>Number.isFinite(Number(n))?Math.round(Number(n)*100)+"%":"—";
  const rrText=n=>Number.isFinite(Number(n))?Number(n).toFixed(2):"—";
  const money=n=>Number.isFinite(Number(n))?(Number(n)>=0?"+":"-")+"$"+Math.abs(Number(n)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
  const setupOptionsHtml=()=>setupOptions().map(x=>"<option>"+esc(x)+"</option>").join("");
  const sessionOptionsHtml=()=>sessionOptions().map(x=>"<option>"+esc(x)+"</option>").join("");
  const journalRows=()=>state.journal.map(x=>[x.time||x.date||"—",String(x.symbol||"—").toUpperCase(),x.side||"—",x.entry||"—",x.exit||"—",x.qty||"—",money(Number(x.pnl)),x.rr||"—",x.setup||"—"]);
  const futuresLiveRows=()=>{const a=liveAccount();return a.connected?(a.fills||[]).slice(-12).reverse().map(f=>[f.timestamp?new Date(f.timestamp).toLocaleTimeString("en-CA",{hour12:false}):"—",f.instrument||"—",/SELL|SHORT|S/i.test(String(f.action||f.buySell||""))?"Short":"Long",f.price!=null?Number(f.price).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—","—",f.qty??"—","—","—","TRADOVATE"]):[]};
  const cryptoObservedRows=()=>state.kcex.events.slice(-12).reverse().map(x=>[x.time||"—",x.instrument||"—",x.direction||"—",x.price??"—","—",x.quantity??"—","DETECTED","—",x.orderType||"ORDER"]);
  const currentRows=()=>crypto()?cryptoObservedRows().concat(state.journal.slice(0,6).map(x=>[x.time||x.date||"—",x.symbol||"—",x.side||"—",x.entry||"—",x.exit||"—",x.qty||"—",money(Number(x.pnl)),"—",x.setup||"—"])):futuresLiveRows().concat(state.journal.slice(0,6).map(x=>[x.time||x.date||"—",x.symbol||"—",x.side||"—",x.entry||"—",x.exit||"—",x.qty||"—",money(Number(x.pnl)),x.rr||"—",x.setup||"—"]));

  function go(mode,view="overview"){
    if(!["NQ","CRYPTO"].includes(mode)) return;
    if(!["overview","trades","performance","ai","journal","analytics","backtests","connections","settings"].includes(view)) view="overview";
    state.mode=mode; state.view=view; state.journal=loadJournal(mode);
    localStorage.setItem("edgeflow-mode",mode); localStorage.setItem("edgeflow-view",view);
    history.replaceState({}, "", "?mode="+mode+"&view="+view); render();
  }
  window.enterMode=m=>go(m,"overview");
  window.edgeGo=v=>go(state.mode,v);
  window.edgeHome=()=>{state.mode="";state.view="overview";localStorage.removeItem("edgeflow-mode");localStorage.removeItem("edgeflow-view");history.replaceState({}, "", location.pathname);render()};
  window.resetEdgeflow=()=>{
    localStorage.removeItem("edgeflow-mode");
    localStorage.removeItem("edgeflow-view");
    localStorage.removeItem("edgeflow-journal");
    localStorage.removeItem("edgeflow-journal:NQ");
    localStorage.removeItem("edgeflow-journal:CRYPTO");
    location.href=location.pathname;
  };

  function sessionState(){
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());
    const h=Number(parts.find(x=>x.type==="hour")?.value||0), m=Number(parts.find(x=>x.type==="minute")?.value||0);
    const mins=h*60+m;
    const defs=[["LONDON",180,300],["NY PRE",450,570],["NY",570,960],["ASIA",1230,1350]];
    const fmt=n=>String(Math.floor(n/60)%24).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
    const next=(start)=>{let d=start-mins;if(d<=0)d+=1440;return d};
    return defs.map(x=>{
      const live=x[1]<=mins&&mins<x[2];
      const until=live?x[2]-mins:next(x[1]);
      return {name:x[0],live,until,label:live?"LIVE":"CLOSED",countdown:Math.floor(until/60)+"h "+String(until%60).padStart(2,"0")+"m",start:fmt(x[1]),end:fmt(x[2])};
    });
  }
  async function refreshTradovateDashboard(){
    if(state.mode!=="NQ"||state.tradovate.loading)return;
    state.tradovate.loading=true;
    try{
      const response=await fetch("https://trading-assistant-production.up.railway.app/api/tradovate/status",{headers:{Accept:"application/json"}});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Tradovate status unavailable");
      state.tradovate.status=data;
      state.tradovate.error="";
      state.tradovate.lastFetch=Date.now();
    }catch(e){state.tradovate.error=String(e.message||e)}
    finally{state.tradovate.loading=false;if(state.view==="overview"&&state.mode==="NQ")renderDashboardOnly();}
  }
  function liveAccount(){
    const st=state.tradovate.status||{};
    const a=(st.accounts||[]).find(x=>x.active)||st.accounts?.[0]||{};
    const c=(st.cashBalances||[])[0]||{};
    const num=(...xs)=>{for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n}return 0};
    const balance=num(a.balance,a.netLiq,a.cashBalance,c.netLiq,c.cashBalance,c.totalCashValue,c.cashBalanceValue);
    const realized=num(a.realizedPnL,c.realizedPnL);
    const unrealized=num(a.unrealizedPnL,c.unrealizedPnL);
    const connected=Boolean(st.connected);
    return {connected,balance,realized,unrealized,account:a.name||"Tradovate",positions:st.positions||[],orders:st.orders||[],fills:st.recentFills||[]};
  }
  function renderDashboardOnly(){
    const el=document.querySelector(".app-page .page-content")||document.querySelector(".app-page");
    if(!el)return;
    const current=document.querySelector(".dash");
    if(!current)return;
    const wrap=document.createElement("div");
    wrap.innerHTML=dashboard();
    const next=wrap.firstElementChild;
    current.replaceWith(next);
  }
  window.setFilter=(key,value)=>{state.filters[key]=value;render()};
  window.exportTrades=()=>{const payload={exportedAt:new Date().toISOString(),environment:d().label,mode:state.mode,trades:currentRows()};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="edgeflow-"+state.mode.toLowerCase()+"-trades.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  window.saveJournal=async e=>{
    e.preventDefault();
    const f=id=>document.getElementById(id),file=f("jScreenshot")&&f("jScreenshot").files[0];
    let screenshot=window.__jarvisPending?.screenshot||"";
    if(file)screenshot=await new Promise(resolve=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const img=new Image();
        img.onload=()=>{
          const max=1400, scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
          const ctx=canvas.getContext("2d");
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/jpeg",.78));
        };
        img.onerror=()=>resolve("");
        img.src=String(reader.result);
      };
      reader.onerror=()=>resolve("");
      reader.readAsDataURL(file);
    });
    state.journal.unshift({id:"j-"+Date.now(),symbol:f("jSymbol").value.trim().toUpperCase(),side:f("jSide").value,pnl:Number(f("jPnl").value)||0,setup:f("jSetup").value||"R.B",grade:f("jGrade").value,note:f("jNote").value||"Execution reviewed.",date:f("jDate").value,time:f("jTime").value,entry:f("jEntry").value,exit:f("jExit").value,qty:f("jQty").value,rr:f("jRR").value,session:f("jSession").value,screenshot});
    localStorage.setItem(journalKey(state.mode),JSON.stringify(state.journal));render();
  };
  window.jarvisPreview=e=>{
    const file=e.target.files&&e.target.files[0], box=document.getElementById("jarvis-preview");
    if(!file||!box)return;
    const url=URL.createObjectURL(file);
    box.innerHTML='<img src="'+url+'" alt="Trade screenshot"><span>'+esc(file.name)+'</span>';
    window.__jarvisImageFile=file;
    const st=document.getElementById("jarvisStatus"); if(st)st.textContent="IMAGE LOADED";
  };
  window.jarvisAnalyze=async()=>{
    const st=document.getElementById("jarvisStatus");
    const note=document.getElementById("jarvisNote");
    if(!window.__jarvisImageFile){if(st)st.textContent="UPLOAD IMAGE FIRST";return}
    try{
      if(st)st.textContent="JARVIS IS ANALYZING...";
      if(note)note.textContent="Vision en cours : lecture du graphique, extraction du trade et vérification avec le modèle "+(crypto()?"Crypto":"Futures")+".";
      const dataUrl=await new Promise(resolve=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result||""));
        reader.onerror=()=>resolve("");
        reader.readAsDataURL(window.__jarvisImageFile);
      });
      if(!dataUrl)throw new Error("Impossible de lire la capture.");
      const response=await fetch("https://trading-assistant-production.up.railway.app/api/jarvis/journal",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:state.mode,imageDataUrl:dataUrl})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||("Jarvis API error · HTTP "+response.status));
      window.__jarvisPending={...data.result,screenshot:dataUrl};
      if(st)st.textContent="ANALYSIS COMPLETE · "+Number(data.result.confidence||0)+"% CONFIDENCE";
      const r=data.result||{};
      const fields=[
        ["SYMBOL",r.symbol],["SIDE",r.side],["ENTRY",r.entry],["EXIT / TP",r.exit],
        ["RR",r.rr],["SETUP",r.setup],["GRADE",r.grade],["SESSION",r.session]
      ];
      const box=document.getElementById("jarvisFields");
      if(box)box.innerHTML=fields.map(x=>'<div><small>'+esc(x[0])+'</small><b>'+esc(x[1]??"UNKNOWN")+'</b></div>').join("");
      if(note)note.textContent=r.note||"Jarvis n'a pas pu générer une note.";
    }catch(e){
      if(st)st.textContent="JARVIS ERROR";
      if(note)note.textContent=String(e.message||e);
    }
  };
  window.jarvisSaveToJournal=()=>{
    const p=window.__jarvisPending;
    if(!p){if(window.__jarvisImageFile)jarvisAnalyze();else alert("Analyse une capture avec Jarvis d'abord.");return}
    const nowLocal=new Date();
    const date=nowLocal.getFullYear()+"-"+String(nowLocal.getMonth()+1).padStart(2,"0")+"-"+String(nowLocal.getDate()).padStart(2,"0");
    const time=String(nowLocal.getHours()).padStart(2,"0")+":"+String(nowLocal.getMinutes()).padStart(2,"0");
    const entry={id:"j-"+Date.now(),symbol:String(p.symbol||"").trim().toUpperCase(),side:p.side||"Long",pnl:Number(p.pnl)||0,setup:p.setup||"Rejection Block",grade:p.grade||"C",note:p.note||"Jarvis vision review.",date,time,entry:p.entry||"",exit:p.exit||"",qty:p.qty||"",rr:p.rr||"",session:p.session||"London",screenshot:p.screenshot||""};
    if(!entry.symbol){const note=document.getElementById("jarvisNote");if(note)note.textContent="Jarvis n'a pas détecté de symbole lisible. Vérifie la capture avant de sauvegarder.";return}
    state.journal.unshift(entry);
    localStorage.setItem(journalKey(state.mode),JSON.stringify(state.journal));
    window.__jarvisPending=null;window.__jarvisImageFile=null;render();
  };
  window.jarvisSendToJournal=()=>jarvisSaveToJournal();
  window.exportJournal=()=>{
    const payload={exportedAt:new Date().toISOString(),environment:d().label,environmentKey:state.mode,entries:state.journal};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="edgeflow-journal.json"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  window.clearJournal=()=>{if(confirm("Clear the locally stored journal for this environment?")){state.journal=[];localStorage.setItem(journalKey(state.mode),"[]");render()}};
  window.deleteJournalEntry=id=>{state.journal=state.journal.filter(x=>String(x.id)!==String(id));localStorage.setItem(journalKey(state.mode),JSON.stringify(state.journal));render()};
  const mountain=(color)=>{
    const red=color==="r", c=red?"#ff173f":"#168dff", hi=red?"#ff5a68":"#53c5ff", glow=red?"#ff163f":"#128cff";
    return '<svg class="mountain" viewBox="0 0 1200 650" preserveAspectRatio="none" aria-hidden="true"><defs>'+
      '<linearGradient id="sky'+color+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#01040a"/><stop offset=".58" stop-color="'+(red?"#10040a":"#03101d")+'"/><stop offset="1" stop-color="#02050a"/></linearGradient>'+
      '<linearGradient id="peak'+color+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+hi+'"/><stop offset=".35" stop-color="'+c+'" stop-opacity=".8"/><stop offset="1" stop-color="#02050a"/></linearGradient>'+
      '<linearGradient id="ground'+color+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+c+'" stop-opacity=".35"/><stop offset="1" stop-color="#02040a"/></linearGradient>'+
      '<filter id="glow'+color+'"><feGaussianBlur stdDeviation="9"/></filter></defs>'+
      '<rect width="1200" height="650" fill="url(#sky'+color+')"/>'+
      '<g opacity=".55" filter="url(#glow'+color+')"><path d="M0 430L150 260 230 360 370 120 500 330 650 180 790 350 950 95 1200 300V650H0Z" fill="'+glow+'"/></g>'+
      '<path d="M0 455L120 315 190 360 295 175 370 275 475 105 555 300 660 205 735 330 845 145 930 255 1035 65 1120 235 1200 155V650H0Z" fill="url(#peak'+color+')" opacity=".92"/>'+
      '<path d="M0 510L145 375 245 425 335 310 445 405 545 270 655 405 755 315 865 410 970 275 1080 390 1200 285V650H0Z" fill="url(#ground'+color+')" opacity=".8"/>'+
      '<g fill="none" stroke="'+hi+'" stroke-opacity=".35" stroke-width="2"><path d="M295 175L335 310L370 275"/><path d="M475 105L545 270L555 300"/><path d="M845 145L865 410"/><path d="M1035 65L1080 390"/></g>'+
      '<g stroke="'+hi+'" stroke-opacity=".42" stroke-width="2"><path d="M72 80V360"/><path d="M185 120V330"/><path d="M1010 115V345"/><path d="M1125 75V320"/></g>'+
      '<path d="M0 560Q260 505 480 555T900 535T1200 560V650H0Z" fill="#02060b"/>'+
      '<path d="M0 575Q260 520 480 575T900 555T1200 580" fill="none" stroke="'+hi+'" stroke-opacity=".38" stroke-width="3"/>'+
      '</svg>';
  };

  function landing(){
    document.body.className="landing-page";
    root.innerHTML='<div class="landing">'+
      '<div class="land land-r"></div><div class="land land-b"></div>'+
      '<div class="landing-center"><div class="hero-logo"><span>E</span></div><div class="hero-name">EDGE<span>FLOW</span></div><div class="hero-sub">TRADING INTELLIGENCE</div><div class="choose">CHOOSE YOUR ENVIRONMENT</div><div class="tagline">SAME EDGE. DIFFERENT MARKETS.</div>'+
      '<div class="env-cards">'+
      '<button class="env red" onclick="enterMode(\'NQ\')"><div class="env-head"><b>▥</b><strong>FUTURES</strong></div><small>MNQ | MES | MGC | etc.</small><ul><li>◉ Tradovate</li><li>◉ Rithmic</li><li>✦ AI Assistant</li><li>▣ Journal</li><li>◫ Analytics</li></ul><i>→</i></button>'+
      '<button class="env blue" onclick="enterMode(\'CRYPTO\')"><div class="env-head"><b>◉</b><strong>CRYPTO</strong></div><small>BTC | ETH | SOL | BNB | XRP | HYPE</small><ul><li>◉ KCEX</li><li>✦ AI Assistant</li><li>▣ Journal</li><li>◫ Analytics</li></ul><i>→</i></button>'+
      '</div></div><div class="landing-foot">DISCIPLINE × DATA × EXECUTION</div><div class="landing-corner">A HIGHER STANDARD<br>FOR TRADERS</div></div>';
  }

  const NAV=[["overview","⌂","Overview","Market command center"],["trades","▤","Trades","Execution history"],["performance","◒","Performance","Metrics & expectancy"],["ai","✦","AI Assistant","Edgeflow intelligence"],["journal","▣","Journal","Trading journal"],["analytics","◫","Analytics","Deep statistics"],["backtests","◌","Backtests","Models & samples"],["connections","⌁","Connections","Broker integrations"],["settings","⚙","Settings","Environment controls"]];
  function sidebar(){
    return '<aside class="sidebar"><div class="brand" onclick="edgeHome()"><div class="brand-e">E</div><div><b>EDGE<span>FLOW</span></b><small>TRADING INTELLIGENCE</small></div></div>'+
      '<div class="mode-switch"><button class="'+(!crypto()?"active":"")+'" onclick="enterMode(\'NQ\')">FUTURES</button><button class="'+(crypto()?"active blue":"")+'" onclick="enterMode(\'CRYPTO\')">CRYPTO</button></div>'+
      '<div class="side-caption">WORKSPACE</div><nav>'+NAV.slice(0,7).map(n=>'<button class="'+(state.view===n[0]?"selected":"")+'" onclick="edgeGo(\''+n[0]+'\')"><span class="ni">'+n[1]+'</span><span><b>'+n[2]+'</b><small>'+n[3]+'</small></span></button>').join("")+'</nav>'+
      '<div class="side-caption system">SYSTEM</div><nav>'+NAV.slice(7).map(n=>'<button class="'+(state.view===n[0]?"selected":"")+'" onclick="edgeGo(\''+n[0]+'\')"><span class="ni">'+n[1]+'</span><span><b>'+n[2]+'</b><small>'+n[3]+'</small></span></button>').join("")+'</nav>'+
      '<div class="engine"><b>EDGEFLOW CORE</b><small>'+d().connections.join(" · ")+' · ENGINE</small><i></i></div></aside>';
  }
  function topbar(){
    if(crypto()){
      return '<header class="topbar"><div class="crumb">EDGEFLOW CORE <em>•</em> CRYPTO</div><div class="top-actions"><span class="live session-live">● 24/7 OPEN</span><span class="session"><b>KCEX</b><i>PERPETUALS</i></span><span class="session"><b>MODEL</b><i>CRYPTO</i></span><span class="session"><b>KEY OPEN</b><i>SWEEP</i></span><span class="avatar">N</span><span class="user">Nath⌄</span></div></header>';
    }
    const ss=sessionState(),live=ss.find(x=>x.live);
    return '<header class="topbar"><div class="crumb">EDGEFLOW CORE <em>•</em> FUTURES</div><div class="top-actions"><span class="live '+(live?"session-live":"")+'">● '+(live?live.name+" LIVE":"MARKET CLOSED")+'</span>'+
      '<span class="session">LDN <b>'+ss[0].label+'</b><i>'+ss[0].countdown+'</i></span>'+
      '<span class="session">NY PRE <b>'+ss[1].label+'</b><i>'+ss[1].countdown+'</i></span>'+
      '<span class="session">NY <b>'+ss[2].label+'</b><i>'+ss[2].countdown+'</i></span>'+
      '<span class="session">ASIA <b>'+ss[3].label+'</b><i>'+ss[3].countdown+'</i></span>'+
      '<span class="avatar">N</span><span class="user">Nath⌄</span></div></header>';
  }
  function shell(body){
    document.body.className="app-page "+accent();
    root.innerHTML='<div class="app-shell">'+sidebar()+'<main class="main">'+topbar()+'<div class="workspace">'+body+'</div></main></div>';
  }
  const kpi=(l,v,s,cl="")=>'<div class="kpi '+cl+'"><small>'+l+'</small><strong>'+v+'</strong><em>'+s+'</em></div>';
  function panel(title,body,cl=""){return '<section class="panel '+cl+'"><div class="panel-head"><span>'+title+'</span></div>'+body+'</section>'}
  function rows(data=d().rows, full=false){
    return '<div class="rows"><div class="row row-head"><span>TIME</span><span>SYMBOL</span><span>SIDE</span><span>ENTRY</span><span>EXIT</span><span>QTY</span><span>P&L</span><span>RR</span><span>SETUP</span>'+(full?"<span>SHOT</span>":"")+'</div>'+
      data.map(r=>'<div class="row"><span>'+esc(r[0])+'</span><b>'+r[1]+'</b><span class="'+(r[2]==="Long"?"long":"short")+'">'+r[2]+'</span><span>'+r[3]+'</span><span>'+r[4]+'</span><span>'+r[5]+'</span><strong class="'+(r[6].includes("-")?"loss":"win")+'">'+r[6]+'</strong><span>'+r[7]+'</span><span>'+r[8]+'</span>'+(full?"<button class=\"shot\">⌗</button>":"")+'</div>').join("")+'</div>';
  }
  function instrumentCards(){
    return '<div class="asset-grid">'+d().assets.map(x=>'<article class="asset"><div><b>'+x[0]+'</b><i>◈</i></div><strong>'+x[1]+'</strong><small>'+x[2]+' trades <em>'+x[3]+'</em></small></article>').join("")+'</div>';
  }
  function dashboard(){
    const label=d().label;
    const sessions=crypto()?[]:sessionState();
    const acct=crypto()?{connected:false,balance:0,realized:0,unrealized:0,account:"KCEX",positions:[],orders:[],fills:[]} : liveAccount();
    const connected=Boolean(acct.connected);
    const money=n=>"$"+Math.abs(Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
    const signed=n=>(Number(n)||0)>=0?"+":"-";
    const fills=acct.fills||[];
    const today=new Date().toISOString().slice(0,10);
    const todays=fills.filter(x=>String(x.timestamp||"").slice(0,10)===today);
    const pnl=acct.realized;
    const liveRows=connected?todays.slice(-6).reverse().map(f=>[
      new Date(f.timestamp||Date.now()).toLocaleTimeString("en-CA",{hour12:false}),
      f.instrument||"—",
      /SELL|SHORT|S/.test(String(f.action||f.buySell||"").toUpperCase())?"Short":"Long",
      f.price!=null?Number(f.price).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—",
      "—",f.qty??"—","LIVE","—",crypto()?"KCEX":"Tradovate"
    ]):[];
    const tradeRows=connected&&liveRows.length?rows(liveRows,true):'<div class="dashboard-empty"><b>NO LIVE TRADES</b><span>'+ (crypto()?"Connect KCEX to load live crypto orders and fills.":"Tradovate is connected. A fill will appear here automatically.")+'</span></div>';
    const broker=crypto()?"KCEX":"TRADOVATE";
    const statusText=connected?"● "+broker+" CONNECTED":"○ "+broker+" NOT CONNECTED";
    const balanceLabel=crypto()?"Portfolio Balance":"Account Balance";
    const balanceText=connected?money(acct.balance):"$0.00";
    const pnlText=connected?signed(pnl)+money(pnl):"$0.00";
    const sessionCards=crypto()?'<span class="session-live"><b>24/7</b><small>OPEN</small><em>KCEX · CRYPTO FUTURES</em></span>':sessions.map(x=>'<span class="'+(x.live?"session-live":"session-closed")+'"><b>'+x.name+'</b><small>'+x.label+'</small><em>'+(x.live?x.start+"–"+x.end:x.countdown)+'</em></span>').join("");
    return '<div class="dash premium-dashboard">'+
      '<div class="dash-banner"><div class="dash-brand"><div class="mini-mark">E</div><div><small>EDGEFLOW CORE • '+label+'</small><h1>'+label+'</h1><p>'+(crypto()?"BTC | ETH | SOL | BNB | XRP | HYPE | FLOKI":"MNQ | MES | MGC | RITHMIC | TRADOVATE")+'</p></div></div>'+
      '<div class="dash-sessions"><span class="live '+(connected?"":"offline")+'">'+statusText+'</span>'+sessionCards+'</div></div>'+
      '<div class="account-state '+(connected?"connected":"offline")+'"><span>'+statusText+'</span><small>'+(connected?acct.account+" · live account data":(crypto()?"Connect KCEX in the Crypto environment to load live data.":"Connect Tradovate in Connections to load live account data."))+'</small><button onclick="edgeGo(&#039;connections&#039;)">CONNECTIONS</button></div>'+
      '<div class="kpis">'+
      kpi(balanceLabel,balanceText,connected?"Live account balance":"No account connected",connected?"positive":"")+
      kpi("Today P&L",pnlText,connected?"Realized P&L":"Waiting for connection",connected?(pnl>=0?"positive":"negative"):"")+
      kpi("Unrealized P&L",connected?signed(acct.unrealized)+money(acct.unrealized):"$0.00",connected?"Open positions":"No live data",connected?(acct.unrealized>=0?"positive":"negative"):"")+
      kpi(crypto()?"Open Positions":"Open Positions",String(acct.positions.length),connected?broker:"No account connected")+
      kpi("Live Orders",String(acct.orders.length),connected?broker:"No account connected")+
      kpi("Live Fills",String(acct.fills.length),connected?broker:"No account connected")+
      '</div>'+
      '<div class="dashboard-grid compact-grid"><div class="dashboard-main">'+
      panel(crypto()?"TOP COINS":"TOP INSTRUMENTS",connected?instrumentCards():instrumentCardsZero())+
      panel(connected?"RECENT LIVE TRADES":"RECENT TRADES",tradeRows)+
      '</div><aside class="dashboard-side">'+
      panel(crypto()?"MARKET STATUS":"SESSION CONTEXT",crypto()?'<div class="session-list"><div><b class="is-live">● 24/7 MARKET</b><span>OPEN</span></div><div><b>● KCEX</b><span>PERPETUALS</span></div><div><b>● KEY OPEN</b><span>MANIPULATION / SWEEP</span></div></div>':'<div class="session-list">'+sessions.map(x=>'<div><b class="'+(x.live?"is-live":"")+'">● '+x.name+'</b><span>'+(x.live?x.start+"–"+x.end:x.countdown)+'</span></div>').join("")+'</div>')+
      panel(crypto()?"CRYPTO STATUS":"ACCOUNT STATUS",'<div class="rules"><div><span>Connection</span><b>'+(connected?"ONLINE":"OFFLINE")+'</b></div><div><span>Provider</span><b>'+broker+'</b></div><div><span>Positions</span><b>'+acct.positions.length+'</b></div><div><span>Orders</span><b>'+acct.orders.length+'</b></div></div>')+
      '</aside></div></div>';
  }

  function instrumentCardsZero(){
    return '<div class="asset-grid">'+d().instruments.slice(0,crypto()?4:3).map(x=>'<div class="instrument-card"><div><b>'+esc(x)+'</b><small>WAITING FOR LIVE DATA</small></div><strong>—</strong><i>NO FEED</i></div>').join("")+'</div>';
  }

  function title(k,t,s,button=""){return '<div class="page-title"><div><small>'+k+'</small><h1>'+t+'</h1><p>'+s+'</p></div>'+button+'</div>'}
  function dashboard(){
    const sessions=sessionState();
    const acct=crypto()?{connected:state.kcex.running,balance:null,realized:null,unrealized:null,account:"KCEX",positions:[],orders:state.kcex.events,fills:[]}:liveAccount();
    const connected=Boolean(acct.connected);
    const js=statsFromJournal();
    const recent=currentRows();
    const provider=crypto()?"KCEX · CRYPTO FUTURES":"TRADOVATE";
    const statusText=connected?"● "+provider+" ACTIVE":"○ "+provider+" OFFLINE";
    const liveNote=crypto()?(state.kcex.running?"KCEX screen observer active · read-only visual detection.":"KCEX crypto-futures observer offline · start it from Connections."):(acct.connected?"Tradovate live feed active.":"Tradovate is not connected.");
    const instrumentData=crypto()
      ? (state.kcex.events.length?state.kcex.events.reduce((a,x)=>{const k=String(x.instrument||"").toUpperCase();if(k)a[k]=(a[k]||0)+1;return a},{})
          : null)
      : (acct.connected&&acct.fills.length?acct.fills.reduce((a,x)=>{const k=String(x.instrument||"").toUpperCase();if(k)a[k]=(a[k]||0)+1;return a},{}) : null);
    const cards=instrumentData
      ? Object.entries(instrumentData).slice(0,6).map(([k,n])=>'<article class="asset"><div><b>'+esc(k)+'</b><i>'+esc(provider)+'</i></div><strong>—</strong><small>'+n+' observed events</small></article>').join("")
      : instrumentCardsZero();
    const tradeRows=recent.length?rows(recent,true):'<div class="dashboard-empty"><b>NO TRADE DATA</b><span>'+esc(liveNote)+'</span></div>';
    const sessionCards=sessions.map(x=>'<span class="'+(x.live?"session-live":"session-closed")+'"><b>'+x.name+'</b><small>'+x.label+'</small><em>'+(x.live?x.start+"–"+x.end:x.countdown)+'</em></span>').join("");
    const total=crypto()?null:(acct.connected?acct.realized:null);
    return '<div class="dash premium-dashboard">'+
      '<div class="dash-banner"><div class="dash-brand"><div class="mini-mark">E</div><div><small>EDGEFLOW CORE • '+d().label+'</small><h1>'+d().label+'</h1><p>'+(crypto()?"BTC · ETH · SOL · BNB · XRP · HYPE · FLOKI · KCEX · CRYPTO FUTURES":"MNQ · MES · MGC · TRADOVATE · RITHMIC")+'</p></div></div>'+
      '<div class="dash-sessions"><span class="live '+(connected?"":"offline")+'">'+statusText+'</span>'+sessionCards+'</div></div>'+
      '<div class="account-state '+(connected?"connected":"offline")+'"><span>'+statusText+'</span><small>'+esc(liveNote)+'</small><button onclick="edgeGo(&#039;connections&#039;)">CONNECTIONS</button></div>'+
      '<div class="kpis">'+
      kpi(crypto()?"KCEX Portfolio":"Account Balance",crypto()?"—":(acct.connected?"$"+Math.abs(Number(acct.balance)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—"),crypto()?"Observer does not expose balance":"Live broker balance")+
      kpi("Today P&L",crypto()?(js.count?money(js.todayPnl):"—"):(acct.connected?money(acct.realized):(js.count?money(js.todayPnl):"—")),crypto()?"Journal P&L":"Live realized / journal")+
      kpi("Total P&L",crypto()?(js.count?money(js.total):"—"):(total!=null?money(total):(js.count?money(js.total):"—")),js.count?"Recorded history":"Waiting for data")+
      kpi("Win Rate",pct(js.winRate),js.count?js.wins+"W / "+js.losses+"L":"No journal data")+
      kpi("Profit Factor",rrText(js.pf),"Recorded journal")+
      kpi("Avg RR",rrText(js.avgRR),crypto()?"Recorded journal":"Recorded journal")+
      kpi(crypto()?"Detected Orders":"Open Positions",crypto()?(state.kcex.events.length||"—"):(acct.connected?acct.positions.length:"—"),crypto()?"KCEX crypto-futures observer":(acct.connected?"Tradovate live":"No live account"))+
      '</div>'+
      '<div class="dashboard-grid compact-grid"><div class="dashboard-main">'+
      panel(crypto()?"TOP CRYPTO ACTIVITY":"TOP FUTURES INSTRUMENTS",cards)+
      panel(crypto()?"RECENT KCEX ACTIVITY":(connected?"RECENT TRADOVATE FILLS":"RECENT TRADES"),tradeRows)+
      panel("ACTIVE MODEL",crypto()?'<div class="model-strip"><span>CRYPTO MODEL</span><b>MARKET DIRECTION → KEY OPEN MANIPULATION / SWEEP → HTF POI → ENTRY → HIGH RR</b></div>':'<div class="model-strip"><span>FUTURES / NQ MODEL</span><b>HTF BIAS → POI → LIQUIDITY / MANIPULATION → RETRACEMENT → REJECTION BLOCK → LIMIT</b></div>')+
      '</div><aside class="dashboard-side">'+
      panel("SESSION CONTEXT",'<div class="session-list">'+sessions.map(x=>'<div><b class="'+(x.live?"is-live":"")+'">● '+x.name+'</b><span>'+(x.live?x.start+"–"+x.end:x.countdown)+'</span></div>').join("")+'</div>')+
      panel(crypto()?"KCEX STATUS":"ACCOUNT STATUS",'<div class="rules"><div><span>Provider</span><b>'+provider+'</b></div><div><span>Connection</span><b>'+(connected?"ONLINE":"OFFLINE")+'</b></div><div><span>Orders</span><b>'+ (crypto()?(state.kcex.events.length||"—"):(acct.connected?acct.orders.length:"—"))+'</b></div><div><span>Positions</span><b>'+(crypto()?"Observer only":(acct.connected?acct.positions.length:"—"))+'</b></div></div>')+
      '</aside></div></div>';
  }
  function trades(){
    const data=currentRows();
    const empty='<div class="dashboard-empty"><b>NO EXECUTION DATA</b><span>'+esc(crypto()?"KCEX crypto-futures observer has not detected a visible order change yet.":"Tradovate is not connected and there are no recorded journal trades.")+'</span></div>';
    const filtered=data.filter(r=>(state.filters.side==="ALL"||r[2]===state.filters.side)&&(state.filters.instrument==="ALL"||r[1]===state.filters.instrument)&&(!state.filters.query||r.join(" ").toLowerCase().includes(state.filters.query.toLowerCase())));
    return title("EXECUTION","Trades",crypto()?"KCEX activity plus Crypto journal records.":"Tradovate fills plus Futures journal records.",'<button class="primary" onclick="edgeGo(\'journal\')">+ NEW JOURNAL ENTRY</button>')+
      '<div class="filters"><input value="'+esc(state.filters.query)+'" oninput="setFilter(\'query\',this.value)" placeholder="Search '+(crypto()?"coin, provider, note...":"instrument, setup...")+'"><select onchange="setFilter(\'side\',this.value)"><option value="ALL">All sides</option><option value="Long">Long</option><option value="Short">Short</option></select><select onchange="setFilter(\'instrument\',this.value)"><option value="ALL">All instruments</option>'+d().instruments.map(x=>'<option value="'+esc(x)+'" '+(state.filters.instrument===x?"selected":"")+'>'+esc(x)+'</option>').join("")+'</select><button onclick="exportTrades()">EXPORT</button></div>'+
      panel(crypto()?"KCEX / CRYPTO HISTORY":"TRADOVATE / FUTURES HISTORY",filtered.length?rows(filtered,true):empty);
  }

  function statsTable(){
    const groups={};
    state.journal.forEach(x=>{const k=String(x.setup||"Other");(groups[k]||=[]).push(x)});
    const items=Object.entries(groups).map(([setup,xs])=>{const st=statsFromJournal(xs);return '<div class="stat"><b>'+esc(setup)+'</b><span>'+st.count+'</span><span>'+pct(st.winRate)+'</span><span>'+rrText(st.pf)+'</span><span>'+rrText(st.avgRR)+'</span></div>'}).join("");
    return '<div class="stats"><div class="stat head"><span>SETUP</span><span>TRADES</span><span>WIN RATE</span><span>PF</span><span>AVG RR</span></div>'+(items||'<div class="analytics-empty">No recorded trades in this environment.</div>')+'</div>';
  }
  function calendar(){
    const nowDate=new Date(),year=nowDate.getFullYear(),month=nowDate.getMonth(),first=new Date(year,month,1),days=new Date(year,month+1,0).getDate(),offset=(first.getDay()+6)%7;
    const cells=[];for(let i=0;i<offset;i++)cells.push('<i class="empty"></i>');
    for(let n=1;n<=days;n++){const iso=year+"-"+String(month+1).padStart(2,"0")+"-"+String(n).padStart(2,"0"),count=state.journal.filter(x=>String(x.date||"").slice(0,10)===iso).length;cells.push('<i class="'+(count?"good":"")+'">'+n+(count?"<b>"+count+"</b>":"")+"</i>")}
    return '<div class="calendar"><header>'+nowDate.toLocaleString("en-US",{month:"long",year:"numeric"})+' <span>LIVE LOCAL DATA</span></header><div class="week">M T W T F S S</div><div class="days">'+cells.join("")+'</div></div>';
  }
  function performance(){
    const st=statsFromJournal();
    return title("PERFORMANCE","Performance",crypto()?"Crypto-only recorded performance.":"Futures-only recorded performance.")+
      '<div class="kpis six">'+kpi("Total Trades",st.count||"—","Recorded journal")+kpi("Win Rate",pct(st.winRate),st.count?st.wins+"W / "+st.losses+"L":"No data")+kpi("Profit Factor",rrText(st.pf),"Recorded journal")+kpi("Avg RR",rrText(st.avgRR),"Recorded RR")+kpi("Expectancy",st.count?money(st.total/st.count):"—","Per recorded trade",st.count&&st.total>=0?"positive":"")+kpi("Max Drawdown",st.count?"$"+st.maxDD.toFixed(2):"—","Recorded P&L sequence")+'</div>'+
      '<div class="two-col">'+panel("PERFORMANCE BY SETUP",statsTable())+panel("P&L CALENDAR",calendar())+'</div>';
  }

  function ai(){
    const q=crypto()?["Review my crypto journal","Check crypto market context","Review my last 5 crypto trades"]:["Analyze my last 5 trades","Check market context (NQ)","Review my Futures journal"];
    const ctx=crypto()?"Crypto only · KCEX · Direction → Key Open sweep → HTF POI → entry → high RR":"Futures only · Tradovate/Rithmic · HTF bias → POI → liquidity → retracement → R.B → limit";
    return title("INTELLIGENCE","AI Assistant","JARVIS · "+ctx,'<span class="ai-online">● ONLINE</span>')+
      '<div class="ai-grid">'+panel("EDGEFLOW JARVIS",'<div class="ai-chat"><div class="ai-welcome"><b>JARVIS</b><small>'+esc(ctx)+'</small></div><div id="aiMessages" class="ai-messages"><div class="ai-message jarvis"><b>JARVIS</b><p>Je suis prêt. Le contexte '+(crypto()?"Crypto":"Futures/NQ")+' est verrouillé pour cette conversation.</p></div></div><div class="ai-actions">'+q.map(x=>'<button onclick="aiQuick(this.dataset.q)" data-q="'+esc(x)+'">'+esc(x)+' <span>›</span></button>').join("")+'</div><div class="ai-composer"><input id="aiInput" type="text" autocomplete="off" placeholder="Ask Jarvis anything..." onkeydown="if(event.key===\'Enter\')aiAsk()"><button id="aiSend" onclick="aiAsk()">↗</button></div></div>','ai-panel')+
      panel("ACTIVE MODEL",crypto()?'<div class="context-grid"><div><small>ENVIRONMENT</small><b>CRYPTO</b></div><div><small>PROVIDER</small><b>KCEX · CRYPTO FUTURES</b></div><div><small>MODEL</small><b>DIRECTION → KEY OPEN SWEEP → HTF POI → ENTRY → HIGH RR</b></div><div><small>FIB / OTE</small><b>SECONDARY</b></div></div>':'<div class="context-grid"><div><small>ENVIRONMENT</small><b>FUTURES / NQ</b></div><div><small>PROVIDER</small><b>TRADOVATE / RITHMIC</b></div><div><small>MODEL</small><b>HTF BIAS → POI → LIQUIDITY → RETRACEMENT → R.B → LIMIT</b></div><div><small>FIB</small><b>0.50 · 0.62 · 0.705 · 0.79</b></div></div>')+
      '</div>';
  }
  window.aiAsk=async function(){
    const input=document.getElementById("aiInput"),box=document.getElementById("aiMessages"),send=document.getElementById("aiSend");
    if(!input||!box)return;const question=String(input.value||"").trim();if(!question)return;
    input.value="";if(send)send.disabled=true;
    box.insertAdjacentHTML("beforeend",'<div class="ai-message user"><b>YOU</b><p>'+esc(question)+'</p></div>');
    state.aiTurns.push({role:"user",content:question});
    const loading=document.createElement("div");loading.className="ai-message jarvis loading";loading.innerHTML="<b>JARVIS</b><p>Analyse en cours...</p>";box.appendChild(loading);box.scrollTop=box.scrollHeight;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    try{
      const r=await fetch(API_BASE+"/api/ai/chat",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},signal:controller.signal,body:JSON.stringify({model:state.mode,question,history:state.journal.slice(0,30),chatHistory:state.aiTurns.slice(-12)})});
      const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw new Error(data.error||("Jarvis API error · HTTP "+r.status));
      const answer=String(data.text||"Aucune réponse.").trim();state.aiTurns.push({role:"assistant",content:answer});
      loading.classList.remove("loading");loading.innerHTML="<b>JARVIS</b><p>"+esc(answer)+"</p>";
    }catch(err){loading.classList.remove("loading");loading.innerHTML="<b>JARVIS · ERROR</b><p>"+esc(err?.name==="AbortError"?"Timeout Jarvis (35 s).":String(err?.message||err))+"</p>";}
    finally{clearTimeout(timer);if(send)send.disabled=false;input.focus();box.scrollTop=box.scrollHeight;}
  };
  window.aiQuick=function(text){const input=document.getElementById("aiInput");if(input){input.value=String(text||"");aiAsk();}};

  function journal(){
    const entries=state.journal;
    const month=new Date().toLocaleString("en-US",{month:"long",year:"numeric"});
    const nowDate=new Date();
    const today=nowDate.toISOString().slice(0,10);
    const todays=entries.filter(x=>x.date===today);
    const wins=entries.filter(x=>Number(x.pnl)>0).length;
    const total=entries.reduce((sum,x)=>sum+(Number(x.pnl)||0),0);
    const dayCells=Array.from({length:30},(_,i)=>{
      const dnum=i+1, iso="2026-09-"+String(dnum).padStart(2,"0");
      const count=entries.filter(x=>x.date===iso).length;
      return '<button class="journal-day '+(count?'has-trades ':'')+(iso===today?'today':'')+'" onclick="journalDay(\''+iso+'\')"><span>'+dnum+'</span>'+(count?'<i>'+count+'</i>':'')+'</button>';
    }).join("");
    const cards=(todays.length?todays:entries.slice(0,6)).map(x=>{
      const pnl=Number(x.pnl)||0;
      return '<article class="journal-entry-card">'+
        '<div class="jec-top"><div><b>'+esc(x.symbol||"—")+' <span class="'+(String(x.side||"").toLowerCase()==="long"?"long":"short")+'">'+esc(x.side||"")+'</span></b><small>'+esc(x.date||"")+' · '+esc(x.time||"")+'</small></div>'+
        '<strong class="'+(pnl>=0?"win":"loss")+'">'+(pnl>=0?"+":"-")+"$"+Math.abs(pnl).toFixed(2)+'</strong></div>'+
        '<div class="jec-tags"><span>'+esc(x.setup||"R.B")+'</span><span>RR '+esc(x.rr||"—")+'</span><span>'+esc(x.grade||"—")+'</span><span>'+esc(x.session||"—")+'</span></div>'+
        '<p>'+esc(x.note||"No execution note.")+'</p>'+
        (x.screenshot?'<img src="'+x.screenshot+'" alt="Trade screenshot">':"")+
        '<button class="jec-delete" data-id="'+esc(x.id||"")+'" onclick="deleteJournalEntry(this.dataset.id)">DELETE</button>'+
      '</article>';
    }).join("");
    return title("RECORDS","Journal","Structured trade review and daily execution record.",
      '<div class="journal-actions"><button onclick="exportJournal()">EXPORT</button><button class="primary" onclick="openJournalForm()">+ NEW ENTRY</button></div>')+
      '<div class="journal-main">'+
        '<section class="panel journal-calendar-panel">'+
          '<div class="panel-head"><span>TRADING CALENDAR</span><b>'+month.toUpperCase()+'</b></div>'+
          '<div class="journal-calendar-week"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div>'+
          '<div class="journal-calendar-days">'+dayCells+'</div>'+
          '<div class="journal-summary"><div><small>ENTRIES</small><b>'+entries.length+'</b></div><div><small>WIN RATE</small><b>'+((entries.length?Math.round(wins/entries.length*100):0))+'%</b></div><div><small>NET P&L</small><b class="'+(total>=0?"win":"loss")+'">'+(total>=0?"+":"-")+"$"+Math.abs(total).toFixed(2)+'</b></div></div>'+
          '<div class="journal-storage">● LOCAL STORAGE · FUTURES / CRYPTO ISOLATED</div>'+
        '</section>'+
        '<section class="panel journal-history-panel">'+
          '<div class="panel-head"><span>'+((todays.length)?"TODAY'S ENTRIES":"RECENT ENTRIES")+'</span><b>'+entries.length+' RECORDS</b></div>'+
          '<div class="journal-history">'+(cards||'<div class="journal-empty"><b>No journal entries yet.</b><span>Click + NEW ENTRY to record your first trade.</span></div>')+'</div>'+
        '</section>'+
      '</div>'+
      '<section class="panel journal-jarvis">'+
        '<div class="panel-head"><span>JARVIS VISION · JOURNAL</span><b id="jarvisStatus">WAITING FOR IMAGE</b></div>'+
        '<div class="journal-jarvis-grid">'+
          '<div class="journal-jarvis-upload">'+
            '<div class="jarvis-drop" id="jarvisDrop">'+
              '<div class="jarvis-upload-icon">⌁</div><strong>DROP YOUR TRADE SCREENSHOT</strong><small>Jarvis reads the chart, RR, entry, exit, setup and execution.</small>'+
              '<input id="jarvisImage" type="file" accept="image/*" onchange="jarvisPreview(event)">'+
            '</div>'+
            '<div id="jarvis-preview" class="jarvis-preview"></div>'+
            '<div class="jarvis-actions"><button class="primary" onclick="jarvisAnalyze()">ANALYZE WITH JARVIS</button></div>'+
          '</div>'+
          '<div class="journal-jarvis-result">'+
            '<div id="jarvisFields" class="jarvis-fields"><div><small>SYMBOL</small><b>—</b></div><div><small>SIDE</small><b>—</b></div><div><small>ENTRY</small><b>—</b></div><div><small>EXIT / TP</small><b>—</b></div><div><small>RR</small><b>—</b></div><div><small>SETUP</small><b>—</b></div><div><small>GRADE</small><b>—</b></div><div><small>SESSION</small><b>—</b></div></div>'+
            '<div id="jarvisNote" class="jarvis-note">Envoie une capture. Jarvis l’analyse avec le modèle '+d().label+' puis prépare l’entrée du journal.</div>'+
            '<button class="primary jarvis-journal-btn" onclick="jarvisSaveToJournal()">SAVE TO JOURNAL</button>'+
          '</div>'+
        '</div>'+
      '</section>'+
      '<div id="journal-modal" class="journal-modal" hidden>'+
        '<div class="journal-modal-backdrop" onclick="closeJournalForm()"></div>'+
        '<section class="journal-modal-card">'+
          '<div class="journal-modal-head"><div><small>RECORDS</small><h2>New Trade Entry</h2></div><button onclick="closeJournalForm()">×</button></div>'+
          '<form class="journal-form modal-journal-form" onsubmit="saveJournal(event)">'+
            '<div class="journal-form-grid">'+
              '<label>SYMBOL<input id="jSymbol" required placeholder="'+(crypto()?"BTC":"MNQ")+'"></label>'+
              '<label>DATE<input id="jDate" type="date" value="'+today+'" required></label>'+
              '<label>TIME<input id="jTime" type="time" value="'+now().slice(0,5)+'"></label>'+
              '<label>SIDE<select id="jSide"><option>Long</option><option>Short</option></select></label>'+
              '<label>SETUP / MODEL<select id="jSetup">'+setupOptionsHtml()+'</select></label>'+
              '<label>GRADE<select id="jGrade"><option>A+</option><option>A</option><option>A-</option><option>B+</option><option>B</option><option>B-</option><option>C+</option><option>C</option></select></label>'+
              '<label>ENTRY<input id="jEntry" placeholder="24,862.75"></label><label>EXIT<input id="jExit" placeholder="24,840.25"></label><label>QTY<input id="jQty" placeholder="1"></label>'+
              '<label>P&L<input id="jPnl" type="number" step="0.01" placeholder="225"></label><label>RR<input id="jRR" placeholder="4.5"></label>'+
              '<label>SESSION<select id="jSession"><option>London</option><option>Asia</option><option>NY AM</option><option>NY PM</option></select></label>'+
            '</div>'+
            '<label class="journal-wide">EXECUTION NOTES<textarea id="jNote" rows="5" placeholder="Context, sweep, retracement, R.B, FVG, execution, management and lesson."></textarea></label>'+
            '<label class="journal-wide">TRADE SCREENSHOT<input id="jScreenshot" type="file" accept="image/*"></label>'+
            '<div class="journal-modal-actions"><span>Saved locally in this browser</span><button type="button" onclick="closeJournalForm()">CANCEL</button><button class="primary" type="submit">SAVE TRADE</button></div>'+
          '</form>'+
        '</section>'+
      '</div>';
  }
  window.openJournalForm=()=>{const m=document.getElementById("journal-modal");if(m)m.hidden=false};
  window.closeJournalForm=()=>{const m=document.getElementById("journal-modal");if(m)m.hidden=true};
  window.journalDay=iso=>{
    const e=state.journal.filter(x=>x.date===iso);
    const box=document.querySelector(".journal-history");
    if(!box)return;
    box.innerHTML=e.length?e.map(x=>{
      const pnl=Number(x.pnl)||0;
      return '<article class="journal-entry-card"><div class="jec-top"><div><b>'+esc(x.symbol||"—")+' <span class="'+(String(x.side||"").toLowerCase()==="long"?"long":"short")+'">'+esc(x.side||"")+'</span></b><small>'+esc(x.date||"")+' · '+esc(x.time||"")+'</small></div><strong class="'+(pnl>=0?"win":"loss")+'">'+(pnl>=0?"+":"-")+"$"+Math.abs(pnl).toFixed(2)+'</strong></div><div class="jec-tags"><span>'+esc(x.setup||"R.B")+'</span><span>RR '+esc(x.rr||"—")+'</span><span>'+esc(x.grade||"—")+'</span><span>'+esc(x.session||"—")+'</span></div><p>'+esc(x.note||"No execution note.")+'</p>'+(x.screenshot?'<img src="'+x.screenshot+'" alt="Trade screenshot">':"")+'<button class="jec-delete" data-id="'+esc(x.id||"")+'" onclick="deleteJournalEntry(this.dataset.id)">DELETE</button></article>';
    }).join(""):'<div class="journal-empty"><b>No trades on '+iso+'.</b><span>Choose another day or create a new entry.</span></div>';
  };
  function analytics(){
    const groups={};state.journal.forEach(x=>{const k=String(x.session||"Unknown");(groups[k]||=[]).push(x)});
    const bars=Object.entries(groups).map(([name,xs])=>{const st=statsFromJournal(xs);return '<div><span>'+esc(name)+'</span><i><b style="width:'+(st.winRate==null?0:Math.round(st.winRate*100))+'%"></b></i><em>'+pct(st.winRate)+'</em></div>'}).join("");
    const modelBlock=crypto()
      ? '<div class="discipline large"><div>DIRECTION<strong>MARKET DIRECTION FIRST</strong></div><div>KEY OPEN<strong>MANIPULATION / SWEEP</strong></div><div>HTF<strong>POI ALIGNMENT</strong></div><div>ENTRY<strong>HIGH-RR LOCATION</strong></div></div>'
      : '<div class="discipline large"><div>RETRACEMENT<strong>0.50 · 0.62 · 0.705 · 0.79</strong></div><div>ENTRY<strong>LIMIT ONLY</strong></div><div>TRIGGER<strong>REJECTION BLOCK</strong></div><div>RISK<strong>$100 / TRADE</strong></div></div>';
    return title("ANALYTICS","Analytics","Evidence from the selected environment only.")+
      '<div class="analytics-grid">'+panel("SESSION PERFORMANCE",bars||'<div class="analytics-empty">No session data recorded.</div>')+panel("PERFORMANCE BY SETUP",statsTable())+panel("ACTIVE MODEL",modelBlock)+'</div>';
  }

  const backtestKey=mode=>"edgeflow-backtests:"+mode;
  const loadBacktests=mode=>{
    try{
      const raw=localStorage.getItem(backtestKey(mode));
      const parsed=raw?JSON.parse(raw):[];
      return Array.isArray(parsed)?parsed:[];
    }catch(_){ return []; }
  };
  const saveBacktests=list=>localStorage.setItem(backtestKey(state.mode),JSON.stringify(list));
  const backtestStats=bt=>{
    const trades=Array.isArray(bt.trades)?bt.trades:[];
    const pnls=trades.map(x=>Number(x.pnl)||0);
    const wins=pnls.filter(x=>x>0), losses=pnls.filter(x=>x<0);
    const grossWin=wins.reduce((a,b)=>a+b,0), grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
    const net=pnls.reduce((a,b)=>a+b,0);
    const rr=trades.map(x=>Number(x.rr)).filter(x=>Number.isFinite(x));
    return {
      count:trades.length,
      wins:wins.length,
      losses:losses.length,
      winRate:trades.length?Math.round(wins.length/trades.length*100):0,
      pf:grossLoss?grossWin/grossLoss:(grossWin?Infinity:0),
      avgRR:rr.length?rr.reduce((a,b)=>a+b,0)/rr.length:0,
      net:net,
      expectancy:trades.length?net/trades.length:0
    };
  };
  window.openBacktestForm=()=>{
    const m=document.getElementById("backtest-modal");
    if(m)m.hidden=false;
  };
  window.closeBacktestForm=()=>{
    const m=document.getElementById("backtest-modal");
    if(m)m.hidden=true;
  };
  window.createBacktest=e=>{
    e.preventDefault();
    const f=id=>document.getElementById(id);
    const bt={
      id:"bt-"+Date.now(),
      name:f("btName").value.trim()||"Untitled Study",
      instrument:f("btInstrument").value,
      session:f("btSession").value,
      date:f("btDate").value,
      notes:f("btNotes").value.trim(),
      createdAt:new Date().toISOString(),
      trades:[]
    };
    const list=loadBacktests(state.mode);
    list.unshift(bt);
    saveBacktests(list);
    state.activeBacktest=bt.id;
    closeBacktestForm();
    render();
  };
  window.openBacktest=id=>{
    state.activeBacktest=String(id);
    render();
  };
  window.closeBacktest=()=>{
    state.activeBacktest=null;
    render();
  };
  window.deleteBacktest=id=>{
    if(!confirm("Delete this backtest and all of its historical trades?"))return;
    const list=loadBacktests(state.mode).filter(x=>String(x.id)!==String(id));
    saveBacktests(list);
    if(String(state.activeBacktest)===String(id))state.activeBacktest=null;
    render();
  };
  window.addBacktestTrade=e=>{
    e.preventDefault();
    const list=loadBacktests(state.mode);
    const bt=list.find(x=>String(x.id)===String(state.activeBacktest));
    if(!bt)return;
    const f=id=>document.getElementById(id);
    bt.trades=Array.isArray(bt.trades)?bt.trades:[];
    bt.trades.push({
      id:"btt-"+Date.now(),
      date:f("bttDate").value,
      side:f("bttSide").value,
      pnl:Number(f("bttPnl").value)||0,
      rr:Number(f("bttRR").value)||0,
      setup:f("bttSetup").value,
      note:f("bttNote").value.trim()
    });
    saveBacktests(list);
    render();
  };
  window.deleteBacktestTrade=id=>{
    const list=loadBacktests(state.mode);
    const bt=list.find(x=>String(x.id)===String(state.activeBacktest));
    if(!bt)return;
    bt.trades=(bt.trades||[]).filter(x=>String(x.id)!==String(id));
    saveBacktests(list);
    render();
  };
  window.exportBacktest=id=>{
    const bt=loadBacktests(state.mode).find(x=>String(x.id)===String(id));
    if(!bt)return;
    const blob=new Blob([JSON.stringify(bt,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=(bt.name||"edgeflow-backtest").replace(/[^a-z0-9_-]+/gi,"-").toLowerCase()+".json";
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  function backtests(){
    const list=loadBacktests(state.mode);
    if(state.activeBacktest){
      const bt=list.find(x=>String(x.id)===String(state.activeBacktest));
      if(bt){
        const st=backtestStats(bt);
        const trades=(bt.trades||[]).map(x=>
          '<div class="bt-trade-row">'+
          '<span>'+esc(x.date||"—")+'</span><b>'+esc(x.side||"—")+'</b>'+
          '<span class="'+((Number(x.pnl)||0)>=0?"win":"loss")+'">'+((Number(x.pnl)||0)>=0?"+":"-")+"$"+Math.abs(Number(x.pnl)||0).toFixed(2)+'</span>'+
          '<span>'+esc(x.rr||"—")+'</span><span>'+esc(x.setup||"—")+'</span>'+
          '<span>'+esc(x.note||"")+'</span>'+
          '<button class="bt-delete" data-id="'+esc(x.id||"")+'" onclick="deleteBacktestTrade(this.dataset.id)">×</button>'+
          '</div>'
        ).join("");
        const pf=Number.isFinite(st.pf)?st.pf.toFixed(2):"∞";
        return title("RESEARCH","Backtest Lab",esc(bt.name),'<div class="bt-actions"><button onclick="exportBacktest(\''+esc(bt.id)+'\')">EXPORT</button><button onclick="closeBacktest()">← LIBRARY</button></div>')+
          '<div class="bt-lab-head">'+
            '<div><small>INSTRUMENT</small><b>'+esc(bt.instrument)+'</b></div>'+
            '<div><small>SESSION</small><b>'+esc(bt.session)+'</b></div>'+
            '<div><small>STUDY DATE</small><b>'+esc(bt.date||"—")+'</b></div>'+
            '<div><small>TRADES</small><b>'+st.count+'</b></div>'+
          '</div>'+
          '<div class="kpis bt-kpis">'+kpi("Win Rate",st.winRate+"%",st.wins+"W / "+st.losses+"L")+kpi("Profit Factor",pf,"Gross win / loss")+kpi("Avg RR",st.avgRR?st.avgRR.toFixed(2):"—","Recorded RR")+kpi("Net P&L",(st.net>=0?"+":"-")+"$"+Math.abs(st.net).toFixed(2),"Historical sample",st.net>=0?"positive":"negative")+kpi("Expectancy",(st.expectancy>=0?"+":"-")+"$"+Math.abs(st.expectancy).toFixed(2),"Per historical trade")+'</div>'+
          '<div class="bt-lab-grid">'+
            panel("ADD HISTORICAL TRADE",
              '<form class="bt-form" onsubmit="addBacktestTrade(event)">'+
              '<label>DATE<input id="bttDate" type="date" required></label>'+
              '<label>SIDE<select id="bttSide"><option>Long</option><option>Short</option></select></label>'+
              '<label>P&L<input id="bttPnl" type="number" step="0.01" placeholder="225" required></label>'+
              '<label>RR<input id="bttRR" type="number" step="0.1" placeholder="3.5"></label>'+
              '<label>SETUP<select id="bttSetup">'+setupOptionsHtml()+'</select></label>'+
              '<label class="bt-wide">NOTE<input id="bttNote" placeholder="What happened in the historical setup?"></label>'+
              '<button class="primary bt-wide" type="submit">+ ADD TRADE TO STUDY</button>'+
              '</form>'
            )+
            panel("HISTORICAL TRADES",
              '<div class="bt-trades"><div class="bt-trade-row head"><span>DATE</span><span>SIDE</span><span>P&L</span><span>RR</span><span>SETUP</span><span>NOTE</span><span></span></div>'+
              (trades||'<div class="bt-empty">No historical trades yet. Add the first sample above.</div>')+'</div>'
            )+
          '</div>'+
          (bt.notes?'<section class="panel bt-notes"><div class="panel-head"><span>STUDY NOTES</span></div><p>'+esc(bt.notes)+'</p></section>':"");
      }
      state.activeBacktest=null;
    }
    const rows=list.map(bt=>{
      const st=backtestStats(bt);
      const pf=Number.isFinite(st.pf)?st.pf.toFixed(2):"∞";
      return '<div class="bt-row" data-id="'+esc(bt.id)+'">'+
        '<button class="bt-name" data-id="'+esc(bt.id)+'" onclick="openBacktest(this.dataset.id)"><b>'+esc(bt.name)+'</b><small>'+esc(bt.notes||"Open study")+'</small></button>'+
        '<span>'+esc(bt.instrument)+'</span><span>'+st.count+'</span><span>'+st.winRate+'%</span><span>'+pf+'</span><span>'+esc(bt.date||"—")+'</span>'+
        '<button class="bt-open" data-id="'+esc(bt.id)+'" onclick="openBacktest(this.dataset.id)">OPEN</button>'+
        '<button class="bt-delete" data-id="'+esc(bt.id)+'" onclick="deleteBacktest(this.dataset.id)">×</button>'+
      '</div>';
    }).join("");
    return title("RESEARCH","Backtests","Build a historical sample, record every setup and calculate the real statistics.",'<button class="primary" onclick="openBacktestForm()">+ NEW BACKTEST</button>')+
      '<div class="bt-overview">'+
        panel("BACKTEST LIBRARY",
          '<div class="bt"><div class="bt-row head"><span>NAME</span><span>INSTRUMENT</span><span>TRADES</span><span>WIN RATE</span><span>PF</span><span>DATE</span><span></span><span></span></div>'+
          (rows||'<div class="bt-empty">No backtests yet. Create a study to start recording historical setups.</div>')+
          '</div>'
        )+
      '</div>'+
      '<div id="backtest-modal" class="journal-modal" hidden>'+
        '<div class="journal-modal-backdrop" onclick="closeBacktestForm()"></div>'+
        '<section class="journal-modal-card backtest-modal-card">'+
          '<div class="journal-modal-head"><div><small>RESEARCH</small><h2>New Backtest Study</h2></div><button onclick="closeBacktestForm()">×</button></div>'+
          '<form class="journal-form" onsubmit="createBacktest(event)">'+
            '<div class="journal-form-grid">'+
              '<label>NAME<input id="btName" required placeholder="London R.B Model"></label>'+
              '<label>INSTRUMENT<select id="btInstrument">'+d().instruments.map(x=>'<option>'+x+'</option>').join("")+'</select></label>'+
              '<label>SESSION<select id="btSession">'+sessionOptionsHtml()+'</select></label>'+
              '<label>STUDY DATE<input id="btDate" type="date" required></label>'+
            '</div>'+
            '<label class="journal-wide">NOTES<textarea id="btNotes" rows="4" placeholder="Model rules, date range, filters and what this study is testing."></textarea></label>'+
            '<div class="journal-modal-actions"><span>Stored locally for '+d().label+'</span><button type="button" onclick="closeBacktestForm()">CANCEL</button><button class="primary" type="submit">CREATE STUDY</button></div>'+
          '</form>'+
        '</section>'+
      '</div>';
  }
  function connections(){
    if(crypto()){
      return title("SYSTEM","Crypto Connections","KCEX is exclusive to Crypto. No Tradovate or Rithmic controls are shown here.")+
        '<div class="connections connection-stack">'+
        '<article class="connection connection-live '+(state.kcex.running?"is-connected":"is-offline")+'">'+
          '<div class="conn-icon blue">K</div><div class="conn-copy"><h3>KCEX · CRYPTO FUTURES</h3><small>CRYPTO ONLY · READ-ONLY SCREEN OBSERVER</small><b class="'+(state.kcex.running?"ok":"warn")+'">● '+(state.kcex.running?"OBSERVING":"OFFLINE")+'</b>'+
          '<p>'+(state.kcex.running?"The shared KCEX window is being sampled. Only visible order/position changes are logged.":"Share only the KCEX trading window to start visual order detection.")+'</p></div>'+
          '<button class="primary" onclick="'+(state.kcex.running?"stopKcexObserver()":"startKcexObserver()")+'">'+(state.kcex.running?"STOP OBSERVER":"START OBSERVER")+'</button>'+
        '</article>'+
        '<article class="connection"><div class="conn-icon blue">J</div><h3>JARVIS AI</h3><small>CRYPTO MODEL · ISOLATED CONTEXT</small><b class="ok">● ONLINE</b><button onclick="edgeGo(\'ai\')">OPEN JARVIS</button></article>'+
        '</div>'+
        '<section class="panel connection-help"><div class="panel-head"><span>CRYPTO PIPELINE</span></div><p>KCEX belongs to the Crypto environment in EdgeFlow. Futures broker integrations never appear in this workspace.</p><div class="setup-grid"><div><small>PROVIDER</small><b>KCEX · CRYPTO FUTURES</b></div><div><small>MODEL</small><b>CRYPTO</b></div><div><small>READ MODE</small><b>SCREEN OBSERVER</b></div></div></section>';
    }
    const tv=state.tradovate.status||{},tvConnected=Boolean(tv.connected),tvConfigured=Boolean(tv.configured);
    const tvStatus=tvConnected?"CONNECTED":(tvConfigured?"READY TO CONNECT":"CREDENTIALS REQUIRED");
    return title("SYSTEM","Futures Connections","Tradovate and Rithmic are exclusive to Futures. KCEX is not shown in this workspace.")+
      '<div class="connections connection-stack">'+
      '<article class="connection connection-live '+(tvConnected?"is-connected":"is-offline")+'">'+
        '<div class="conn-icon">T</div><div class="conn-copy"><h3>TRADOVATE</h3><small>FUTURES ONLY · ACCOUNT / POSITIONS / ORDERS / FILLS</small><b class="'+(tvConnected?"ok":"warn")+'">● '+tvStatus+'</b>'+
        '<p>'+(tvConnected?"Live Tradovate account data is flowing to Futures.":(tvConfigured?"Credentials are configured. Click connect to start the live feed.":"Add the five Tradovate server variables in Railway."))+'</p></div>'+
        '<button class="primary" onclick="connectTradovateUI()">'+(tvConnected?"REFRESH":"CONNECT")+'</button>'+
      '</article>'+
      '<article class="connection"><div class="conn-icon">R</div><h3>RITHMIC</h3><small>FUTURES ONLY · ACCOUNT FEED</small><b class="warn">○ NOT CONFIGURED</b><button onclick="alert(\'Rithmic credentials are not configured on Railway yet.\')">MANAGE</button></article>'+
      '<article class="connection"><div class="conn-icon">J</div><h3>JARVIS AI</h3><small>FUTURES MODEL · ISOLATED CONTEXT</small><b class="ok">● ONLINE</b><button onclick="edgeGo(\'ai\')">OPEN JARVIS</button></article>'+
      '</div>'+
      '<section class="panel connection-help"><div class="panel-head"><span>FUTURES PIPELINE</span></div><p>Tradovate credentials stay on Railway. EdgeFlow receives read-only account state for the Futures dashboard.</p><div class="setup-grid"><div><small>PROVIDER</small><b>TRADOVATE / RITHMIC</b></div><div><small>MODEL</small><b>FUTURES / NQ</b></div><div><small>ENTRY</small><b>LIMIT / REJECTION BLOCK</b></div></div></section>';
  }
  async function detectKcexFrame(){
    if(!state.kcex.running||state.kcex.processing||!state.kcex.video||state.kcex.video.readyState<2)return;
    state.kcex.processing=true;
    try{
      const v=state.kcex.video,cv=state.kcex.canvas,ctx=cv.getContext("2d");
      const scale=Math.min(1,1280/(v.videoWidth||1280));
      cv.width=Math.max(640,Math.round((v.videoWidth||1280)*scale));
      cv.height=Math.max(360,Math.round((v.videoHeight||720)*scale));
      ctx.drawImage(v,0,0,cv.width,cv.height);
      const current=cv.toDataURL("image/jpeg",.55);
      const r=await fetch(API_BASE+"/api/detect-screen-trade",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({broker:"KCEX",model:"CRYPTO",imageDataUrl:current,previousImageDataUrl:state.kcex.previousImage})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok)throw new Error(data.error||("KCEX crypto-futures observer HTTP "+r.status));
      if(data.detected){
        const event={id:"kcex-"+Date.now(),time:new Date().toLocaleTimeString("en-CA",{hour12:false}),instrument:data.instrument||"—",direction:data.direction||"—",orderType:data.orderType||"ORDER",price:data.price??null,quantity:data.quantity??null,confidence:Number(data.confidence||0),context:data.context||""};
        state.kcex.events.push(event);if(state.kcex.events.length>100)state.kcex.events.shift();state.kcex.lastDetected=event;
        if(state.view==="overview"||state.view==="trades"||state.view==="connections")render();
      }
      state.kcex.previousImage=current;state.kcex.error="";
    }catch(err){state.kcex.error=String(err?.message||err);}
    finally{state.kcex.processing=false;}
  }
  window.startKcexObserver=async()=>{
    if(state.kcex.running)return;
    if(!navigator.mediaDevices?.getDisplayMedia){alert("Partage d’écran non supporté par ce navigateur.");return;}
    try{
      state.kcex.error="";
      const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:2,max:5}},audio:false});
      const video=document.createElement("video");video.muted=true;video.playsInline=true;video.srcObject=stream;
      const canvas=document.createElement("canvas");canvas.width=1280;canvas.height=720;
      video.style.cssText="position:fixed;left:-99999px;width:1px;height:1px;opacity:0;pointer-events:none";
      document.body.appendChild(video);await video.play();
      state.kcex={...state.kcex,running:true,processing:false,stream,video,canvas,previousImage:"",events:state.kcex.events,lastDetected:state.kcex.lastDetected,error:"",timer:null};
      const track=stream.getVideoTracks()[0];track.addEventListener("ended",()=>stopKcexObserver());
      render();state.kcex.timer=setInterval(()=>detectKcexFrame(),3000);
    }catch(err){state.kcex.error=String(err?.message||err);alert("KCEX crypto-futures observer: "+state.kcex.error);render();}
  };
  window.stopKcexObserver=()=>{
    try{if(state.kcex.timer)clearInterval(state.kcex.timer);}catch{}
    try{state.kcex.stream?.getTracks().forEach(t=>t.stop());}catch{}
    try{state.kcex.video?.remove();}catch{}
    state.kcex={...state.kcex,running:false,processing:false,stream:null,video:null,canvas:null,previousImage:"",timer:null};
    render();
  };
  window.connectTradovateUI=async()=>{
    const button=document.querySelector(".connection-live .primary");
    if(button){button.disabled=true;button.textContent="CONNECTING...";}
    try{
      const response=await fetch("https://trading-assistant-production.up.railway.app/api/tradovate/connect",{method:"POST",headers:{Accept:"application/json"}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false)throw new Error(data.error||"Tradovate connection failed.");
      state.tradovate.status=data;state.tradovate.error="";state.tradovate.lastFetch=Date.now();render();
    }catch(e){
      state.tradovate.error=String(e.message||e);
      alert(state.tradovate.error);
      render();
    }
  };
  function settings(){
    return title("SYSTEM","Settings","Controls for the selected environment only.")+
      '<div class="settings-grid">'+
      panel("ENVIRONMENT",'<div class="setting"><span>Active Environment</span><b>'+d().label+'</b></div><div class="setting"><span>Provider</span><b>'+(crypto()?"KCEX · CRYPTO FUTURES":"TRADOVATE / RITHMIC")+'</b></div><div class="setting"><span>Storage</span><b>LOCAL JOURNAL</b></div>')+
      (crypto()
        ? panel("CRYPTO MODEL",'<div class="setting"><span>Primary sequence</span><b>DIRECTION → KEY OPEN MANIPULATION / SWEEP → HTF POI → ENTRY → HIGH RR</b></div><div class="setting"><span>OTE / Fibonacci</span><b>SECONDARY ONLY</b></div><div class="setting"><span>Screen observer</span><b>'+(state.kcex.running?"ACTIVE":"OFFLINE")+'</b></div>')
        : panel("FUTURES MODEL",'<div class="setting"><span>Primary sequence</span><b>HTF BIAS → POI → LIQUIDITY → RETRACEMENT → REJECTION BLOCK → LIMIT</b></div><div class="setting"><span>Fibonacci</span><b>0.50 · 0.62 · 0.705 · 0.79</b></div><div class="setting"><span>Risk</span><b>$100 / TRADE</b></div>'))+
      panel("JARVIS",'<div class="setting"><span>AI engine</span><b class="on-text">ONLINE</b></div><div class="setting"><span>Model isolation</span><b>'+(crypto()?"CRYPTO ONLY":"FUTURES / NQ ONLY")+'</b></div><div class="setting"><span>Local time</span><b>'+now()+'</b></div>')+
      '</div>';
  }
  function render(){
    try{
      if(!state.mode){landing();return}
      const pages={overview:dashboard,trades,performance,ai,journal,analytics,backtests,connections,settings};
      shell((pages[state.view]||dashboard)());
      if(state.mode==="NQ"&&state.view==="overview"&&(Date.now()-state.tradovate.lastFetch>5000)&&!state.tradovate.loading) refreshTradovateDashboard();
    }catch(err){
      console.error("EdgeFlow render error",err);
      document.body.className="app-page red";
      root.innerHTML='<div class="fatal"><div class="fatal-card"><div class="fatal-mark">E</div><h1>EDGEFLOW</h1><p>The workspace could not be rendered. Your journal data has not been intentionally deleted.</p><button onclick="resetEdgeflow()">RESET LOCAL APP STATE</button><button onclick="location.reload()">RELOAD</button></div></div>';
    }
  }
  render();
  setInterval(()=>{
    if(state.mode==="NQ"&&state.view==="overview"&&!state.tradovate.loading&&(Date.now()-state.tradovate.lastFetch>5000))refreshTradovateDashboard();
    if(state.mode&&document.querySelector(".topbar")){
      const t=document.querySelector(".topbar");
      if(!crypto()){
        const ss=sessionState(),live=ss.find(x=>x.live),nodes=t.querySelectorAll(".session");
        if(nodes.length>=4){[0,1,2,3].forEach((i)=>{const b=nodes[i].querySelector("b"),em=nodes[i].querySelector("i");if(b)b.textContent=ss[i].label;if(em)em.textContent=ss[i].countdown});}
        const liveEl=t.querySelector(".live");if(liveEl)liveEl.textContent="● "+(live?live.name+" LIVE":"MARKET CLOSED");
      }else{
        const liveEl=t.querySelector(".live");if(liveEl)liveEl.textContent="● 24/7 OPEN";
      }
    }
  },1000);
})();