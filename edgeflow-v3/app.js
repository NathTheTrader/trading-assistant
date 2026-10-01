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
  const state = { filters:{query:"",side:"ALL",instrument:"ALL",setup:"ALL"},
    mode: requestedMode,
    view: validViews.includes(requestedView) ? requestedView : "overview",
    journal: loadJournal(requestedMode)
  };
  const DATA = {
    NQ: {
      label:"FUTURES", accent:"red", instruments:["MNQ","MES","MGC"],
      rows:[
        ["09:12:34","MNQ","Short","24,862.75","24,840.25","1","+ $225.00","4.5","R.B + FVG"],
        ["08:47:12","MES","Long","6,120.50","6,158.00","2","+ $420.00","3.1","Sweep + OB"],
        ["07:22:18","MGC","Short","3,872.40","3,861.20","1","- $160.00","1.2","News Fade"],
        ["06:11:05","MNQ","Long","24,910.25","24,926.50","1","+ $160.00","2.8","10H Open"],
        ["05:38:41","MES","Long","6,029.25","6,031.50","1","+ $120.00","2.1","R.B"],
        ["Sep 29","MGC","Short","3,845.10","3,838.00","0.5","- $130.00","1.2","Trend"]
      ],
      assets:[["MNQ","24,856.25","48","62%"],["MES","6,021.75","32","59%"],["MGC","3,872.40","18","67%"]],
      session:["LONDON","NY Open","ASIA"],
      connections:[["Tradovate","Futures","TV"],["Rithmic","Futures","R"],["AI Assistant","Intelligence","AI"]]
    },
    CRYPTO: {
      label:"CRYPTO", accent:"blue", instruments:["BTC","ETH","SOL","BNB","XRP","HYPE","FLOKI"],
      rows:[
        ["09:15:27","BTC","Short","63,120.55","63,420.00","0.02","+ $327.00","3.1","Sweep + OB"],
        ["08:32:11","SOL","Long","148.10","148.90","10","+ $190.00","2.4","R.B"],
        ["07:48:33","ETH","Short","2,460.50","2,452.30","0.5","- $160.00","2.8","FVG"],
        ["06:11:05","BNB","Long","560.20","572.10","1.2","+ $240.00","2.8","10H Open"],
        ["Sep 29","BTC","Long","62,910.00","63,100.00","0.02","+ $185.00","2.2","R.B"],
        ["Sep 28","ETH","Short","2,480.20","2,468.00","0.8","+ $210.00","2.5","FVG"]
      ],
      assets:[["BTC","63,284.50","56","71%"],["ETH","2,452.18","38","66%"],["SOL","148.32","24","62%"],["BNB","573.21","18","61%"]],
      session:["ASIA","LONDON","NY"],
      connections:[["KCEX","Crypto","K"],["AI Assistant","Intelligence","AI"]]
    }
  };
  const d=()=>DATA[state.mode||"NQ"];
  const crypto=()=>state.mode==="CRYPTO";
  const accent=()=>crypto()?"blue":"red";
  const now=()=>new Date().toLocaleTimeString("en-CA",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
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
  window.setFilter=(key,value)=>{state.filters[key]=value;render()};
  window.exportTrades=()=>{const blob=new Blob([JSON.stringify(d().rows,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="edgeflow-trades.json";a.click();URL.revokeObjectURL(a.href)};
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
      if(!response.ok||!data.ok)throw new Error(data.error||"Jarvis API error.");
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
  window.jarvisSendToJournal=()=>{
    const pending=window.__jarvisPending;
    if(!pending){if(window.__jarvisImageFile)jarvisAnalyze();else alert("Analyse une capture avec Jarvis d'abord.");return}
    edgeGo("journal");
    setTimeout(()=>{
      openJournalForm();
      const set=(id,value)=>{const el=document.getElementById(id);if(el&&value!=null)el.value=String(value)};
      set("jSymbol",pending.symbol);set("jSide",pending.side);set("jEntry",pending.entry);set("jExit",pending.exit);
      set("jQty",pending.qty);set("jPnl",pending.pnl);set("jRR",pending.rr);set("jSetup",pending.setup);set("jGrade",pending.grade);set("jSession",pending.session);set("jNote",pending.note);
      const st=document.querySelector(".journal-modal-actions span");if(st)st.textContent="Jarvis prefilled this entry · screenshot attached";
    },120);
  };
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
      '<div class="engine"><b>EDGEFLOW CORE</b><small>'+d().connections.map(x=>x[0]).join(" · ")+' · ENGINE</small><i></i></div></aside>';
  }
  function topbar(){
    return '<header class="topbar"><div class="crumb">EDGEFLOW CORE <em>•</em> '+d().label+'</div><div class="top-actions"><span class="live">● LIVE</span><span class="session">LDN <b>'+now()+'</b></span><span class="session">NY PRE <b>08:24:17</b></span><span class="session">NY <b>CLOSED</b></span><span class="avatar">N</span><span class="user">Nath⌄</span></div></header>';
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
    return '<div class="dash premium-dashboard">'+
      '<div class="dash-banner"><div class="dash-brand"><div class="mini-mark">E</div><div><small>EDGEFLOW CORE • '+label+'</small><h1>'+label+'</h1><p>'+(crypto()?"BTC | ETH | SOL | BNB | XRP | HYPE":"MNQ | MES | MGC | RITHMIC | TRADOVATE")+'</p></div></div>'+
      '<div class="dash-sessions"><span class="live">● LIVE</span><span>LDN<br><b>'+now()+'</b></span><span>NY PRE<br><b>08:24:17</b></span><span>NY<br><b>CLOSED</b></span><span>ASIA<br><b>CLOSED</b></span></div></div>'+
      '<div class="kpis">'+
      kpi("Account Balance","$49,300.00","+0.8%","positive")+kpi("Today P&L","-$120.50","Session result","negative")+kpi("Total P&L","+$3,420.00","Last 30 days","positive")+kpi("Win Rate","62%","48 trades")+kpi("Win / Loss","31 / 19","50 recorded")+kpi("Profit Factor","2.4","Gross / loss")+kpi("Avg RR","3.4","Average R")+
      '</div>'+
      '<div class="dashboard-grid compact-grid"><div class="dashboard-main">'+
      panel(crypto()?"TOP COINS":"TOP INSTRUMENTS",instrumentCards())+
      panel("RECENT TRADES",rows())+
      '</div><aside class="dashboard-side">'+
      panel("SESSION CONTEXT",'<div class="session-list"><div><b>● '+d().session[0]+'</b><span>'+now()+'</span></div><div><b>○ '+d().session[1]+'</b><span>in 05:25:43</span></div><div><b>○ '+d().session[2]+'</b><span>Closed</span></div></div>')+
      panel("ACCOUNT RULES",'<div class="rules"><div><span>Daily Risk</span><b>0% / $1,200</b></div><div><span>Consistency</span><b>62%</b></div><div><span>Max Drawdown</span><b>2.1%</b></div><div><span>Trades Today</span><b>1 / 2</b></div></div>')+
      '</aside></div></div>';
  }

  function title(k,t,s,button=""){return '<div class="page-title"><div><small>'+k+'</small><h1>'+t+'</h1><p>'+s+'</p></div>'+button+'</div>'}
  function trades(){
    return title("EXECUTION","Trades","Full execution history for this environment.",'<button class="primary" onclick="edgeGo(\'journal\')">+ NEW JOURNAL ENTRY</button>')+
      '<div class="filters"><input value="'+esc(state.filters.query)+'" oninput="setFilter(\'query\',this.value)" placeholder="Search instrument, setup..."><select onchange="setFilter(\'side\',this.value)"><option value="ALL">All sides</option><option value="Long">Long</option><option value="Short">Short</option></select><select onchange="setFilter(\'instrument\',this.value)"><option value="ALL">All instruments</option>'+d().instruments.map(x=>'<option '+(state.filters.instrument===x?"selected":"")+'>'+x+'</option>').join("")+'</select><select onchange="setFilter(\'setup\',this.value)"><option value="ALL">All setups</option><option>R.B</option><option>R.B + FVG</option><option>Sweep + OB</option><option>10H Open</option><option>FVG</option></select><select><option>Last 30 days</option></select><button onclick="exportTrades()">EXPORT</button></div>'+panel("TRADE HISTORY",rows(d().rows.concat(d().rows.slice(0,2)).filter(r=>(state.filters.side==="ALL"||r[2]===state.filters.side)&&(state.filters.instrument==="ALL"||r[1]===state.filters.instrument)&&(state.filters.setup==="ALL"||r[8]===state.filters.setup)&&(!state.filters.query||r.join(" ").toLowerCase().includes(state.filters.query.toLowerCase())),true)));
  }
  function statsTable(){
    const a=[["R.B + FVG","18","72%","3.6","4.8"],["Sweep + OB","12","58%","2.1","3.2"],["10H Open","8","75%","2.8","3.9"],["News Fade","6","50%","1.6","2.1"],["Trend","4","50%","1.4","1.8"]];
    return '<div class="stats"><div class="stat head"><span>SETUP</span><span>TRADES</span><span>WIN RATE</span><span>PF</span><span>AVG RR</span></div>'+a.map(r=>'<div class="stat"><b>'+r[0]+'</b><span>'+r[1]+'</span><span>'+r[2]+'</span><span>'+r[3]+'</span><span>'+r[4]+'</span></div>').join("")+'</div>';
  }
  function calendar(){
    return '<div class="calendar"><header>September 2026 <span>‹　›</span></header><div class="week">M　T　W　T　F　S　S</div><div class="days">'+Array.from({length:30},(_,i)=>'<i class="'+([8,15,22,29].includes(i+1)?"good":"")+'">'+(i+1)+'</i>').join("")+'</div></div>';
  }
  function performance(){
    return title("PERFORMANCE","Performance","Risk-adjusted statistics and setup expectancy.")+
      '<div class="kpis six">'+kpi("Total Trades","48","Last 30 days")+kpi("Win Rate","62%","30 / 18")+kpi("Profit Factor","2.4","Gross / loss")+kpi("Avg RR","3.4","Average R")+kpi("Expectancy","+$89.50","Per trade","positive")+kpi("Max Drawdown","2.1%","Account")+'</div><div class="two-col">'+panel("PERFORMANCE BY SETUP",statsTable())+panel("P&L CALENDAR",calendar())+'</div>';
  }
  function ai(){
    return title("INTELLIGENCE","JARVIS","Trading intelligence + visual trade analysis.",'<span class="ai-online">● ONLINE</span>')+
      '<div class="jarvis-layout">'+
        '<section class="panel jarvis-hero">'+
          '<div class="jarvis-orb">E</div><div><small>EDGEFLOW JARVIS</small><h2>Visual Trade Intelligence</h2><p>Send a chart or trade screenshot. Jarvis can structure the information for your journal.</p></div>'+
        '</section>'+
        '<section class="panel jarvis-upload">'+
          '<div class="panel-head"><span>TRADE VISION</span><b>SCREENSHOT → JOURNAL</b></div>'+
          '<div class="jarvis-drop" id="jarvisDrop">'+
            '<div class="jarvis-upload-icon">⌁</div><strong>DROP YOUR TRADE SCREENSHOT</strong><small>Chart, TradingView, execution or result screenshot</small>'+
            '<input id="jarvisImage" type="file" accept="image/*" onchange="jarvisPreview(event)">'+
          '</div>'+
          '<div id="jarvis-preview" class="jarvis-preview"></div>'+
          '<div class="jarvis-actions"><button class="primary" onclick="jarvisAnalyze()">ANALYZE WITH JARVIS</button><button onclick="edgeGo(\'journal\')">OPEN JOURNAL</button></div>'+
        '</section>'+
        '<section class="panel jarvis-result">'+
          '<div class="panel-head"><span>JARVIS EXTRACTION</span><b id="jarvisStatus">WAITING FOR IMAGE</b></div>'+
          '<div id="jarvisFields" class="jarvis-fields"><div><small>SYMBOL</small><b>—</b></div><div><small>SIDE</small><b>—</b></div><div><small>ENTRY</small><b>—</b></div><div><small>EXIT / TP</small><b>—</b></div><div><small>RR</small><b>—</b></div><div><small>SETUP</small><b>—</b></div><div><small>GRADE</small><b>—</b></div><div><small>SESSION</small><b>—</b></div></div>'+
          '<div id="jarvisNote" class="jarvis-note">Jarvis will generate the execution note here after the vision engine is connected.</div>'+
          '<button class="primary jarvis-journal-btn" onclick="jarvisSendToJournal()">SEND TO JOURNAL</button>'+
        '</section>'+
        '<section class="panel"><div class="panel-head"><span>MODEL CONTEXT</span></div><div class="context-grid"><div><small>ENVIRONMENT</small><b>'+d().label+'</b></div><div><small>ENTRY</small><b>LIMIT</b></div><div><small>TRIGGER</small><b>REJECTION BLOCK</b></div><div><small>RETRACE</small><b>0.50 · 0.62 · 0.705 · 0.79</b></div></div></section>'+
      '</div>';
  }
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
              '<label>SETUP / MODEL<select id="jSetup"><option>R.B + FVG</option><option>Rejection Block</option><option>Sweep + OB</option><option>10H Open</option><option>FVG</option><option>Trend</option></select></label>'+
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
    const bars=[["Asia",42],["London",78],["NY AM",61],["NY PM",34]];
    return title("ANALYTICS","Analytics","Deep statistics across sessions, instruments and setups.")+
      '<div class="analytics-grid">'+panel("SESSION PERFORMANCE",'<div class="bars">'+bars.map(x=>'<div><span>'+x[0]+'</span><i><b style="width:'+x[1]+'%"></b></i><em>'+x[1]+'%</em></div>').join("")+'</div>')+panel("PERFORMANCE BY SETUP",statsTable())+panel("EXECUTION DISCIPLINE",'<div class="discipline large"><div>RETRACEMENT<strong>0.50 / 0.62 / 0.705 / 0.79</strong></div><div>ENTRY<strong>LIMIT ONLY</strong></div><div>IMPULSE<strong>BLOCKED</strong></div><div>RISK<strong>$100 / TRADE</strong></div></div>')+'</div>';
  }
  function backtests(){
    const r=[["London R.B Model","MNQ","105","68%","3.2","Sep 19, 2026"],["10H Open Study","MES","75","64%","2.8","Sep 10, 2026"],["Asia Retracement","MGC","52","60%","2.1","Sep 05, 2026"],["FVG Model","MNQ","120","72%","3.4","Aug 28, 2026"],["Trend Model","MES","85","58%","2.1","Aug 20, 2026"]];
    return title("RESEARCH","Backtests","Models, samples and historical validation.",'<button class="primary">+ NEW BACKTEST</button>')+panel("BACKTEST LIBRARY",'<div class="bt"><div class="bt-row head"><span>NAME</span><span>INSTRUMENT</span><span>TRADES</span><span>WIN RATE</span><span>PF</span><span>DATE</span></div>'+r.map(x=>'<div class="bt-row"><b>'+x[0]+'</b><span>'+x[1]+'</span><span>'+x[2]+'</span><span>'+x[3]+'</span><span>'+x[4]+'</span><span>'+x[5]+'</span></div>').join("")+'</div>');
  }
  function connections(){
    return title("SYSTEM","Connections","Broker and service integrations.")+'<div class="connections">'+d().connections.map(x=>'<article class="connection"><div class="conn-icon '+(x[2]==="K"?"blue":"")+'">'+x[2]+'</div><h3>'+x[0]+'</h3><small>'+x[1]+'</small><b>● Connected</b><button>Manage</button></article>').join("")+'</div>';
  }
  function settings(){
    return title("SYSTEM","Settings","Environment controls and preferences.")+'<div class="settings-grid">'+panel("ENVIRONMENT",'<div class="setting"><span>Active Environment</span><b>'+d().label+'</b></div><div class="setting"><span>Theme</span><b>Dark Mode</b></div><div class="setting"><span>Compact Mode</span><b>ON</b></div>')+panel("TRADING MODEL",'<div class="setting"><span>Entry Type</span><b>LIMIT</b></div><div class="setting"><span>Primary Trigger</span><b>REJECTION BLOCK</b></div><div class="setting"><span>Risk Per Trade</span><b>$100</b></div><div class="setting"><span>Fib Retracements</span><b>0.50 · 0.62 · 0.705 · 0.79</b></div>')+panel("NOTIFICATIONS",'<div class="setting"><span>Trade Alerts</span><b class="on-text">ON</b></div><div class="setting"><span>AI Insights</span><b class="on-text">ON</b></div><div class="setting"><span>News Warnings</span><b class="on-text">ON</b></div>')+panel("DATA & SYNC",'<div class="setting"><span>Last Sync</span><b>'+now()+'</b></div><div class="setting"><span>Journal Storage</span><b>LOCAL</b></div>')+'</div>';
  }
  function render(){
    try{
      if(!state.mode){landing();return}
      const pages={overview:dashboard,trades,performance,ai,journal,analytics,backtests,connections,settings};
      shell((pages[state.view]||dashboard)());
    }catch(err){
      console.error("EdgeFlow render error",err);
      document.body.className="app-page red";
      root.innerHTML='<div class="fatal"><div class="fatal-card"><div class="fatal-mark">E</div><h1>EDGEFLOW</h1><p>The workspace could not be rendered. Your journal data has not been intentionally deleted.</p><button onclick="resetEdgeflow()">RESET LOCAL APP STATE</button><button onclick="location.reload()">RELOAD</button></div></div>';
    }
  }
  render();
  setInterval(()=>{const e=document.querySelectorAll(".session b"); if(e.length)e[0].textContent=now()},1000);
})();