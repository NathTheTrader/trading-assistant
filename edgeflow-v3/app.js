/* EDGEFLOW — complete interface rebuild
   Reference-driven UI. No legacy renderer is used. */
(() => {
  const root = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const savedMode = localStorage.getItem("edgeflow-mode");
  const savedView = localStorage.getItem("edgeflow-view");
  const state = {
    mode: params.get("mode")==="CRYPTO" ? "CRYPTO" : params.get("mode")==="NQ" ? "NQ" : savedMode || "",
    view: params.get("view") || savedView || "overview",
    journal: JSON.parse(localStorage.getItem("edgeflow-journal") || "[]"),
    aiMessages: []
  };

  const FUTURES = ["MNQ","MES","MGC"];
  const CRYPTO = ["BTC","ETH","SOL","BNB","XRP","HYPE","FLOKI"];
  const isCrypto = () => state.mode === "CRYPTO";
  const accent = () => isCrypto() ? "blue" : "red";
  const instruments = () => isCrypto() ? CRYPTO : FUTURES;

  const demo = {
    NQ: [
      ["09:12:34","MNQ","Short","24,862.75","24,840.25","1","+ $225.00","4.5","R.B + FVG"],
      ["08:47:12","MES","Long","6,120.50","6,158.00","2","+ $420.00","3.1","Sweep + OB"],
      ["07:22:18","MGC","Short","3,872.40","3,861.20","1","- $160.00","1.2","News Fade"],
      ["06:11:05","MNQ","Long","24,910.25","24,926.50","1","+ $160.00","2.8","10H Open"],
      ["05:38:41","MES","Long","6,029.25","6,031.50","1","+ $120.00","2.1","R.B"],
      ["Sep 29","MGC","Short","3,845.10","3,838.00","0.5","- $130.00","1.2","Trend"]
    ],
    CRYPTO: [
      ["09:15:27","BTC","Short","63,120.55","63,420.00","0.02","+ $327.00","3.1","Sweep + OB"],
      ["08:32:11","SOL","Long","148.10","148.90","10","+ $190.00","2.4","R.B"],
      ["07:48:33","ETH","Short","2,460.50","2,452.30","0.5","- $160.00","2.8","FVG"],
      ["06:11:05","BNB","Long","560.20","572.10","1.2","+ $240.00","2.8","10H Open"],
      ["Sep 29","BTC","Long","62,910.00","63,100.00","0.02","+ $185.00","2.2","R.B"],
      ["Sep 28","ETH","Short","2,480.20","2,468.00","0.8","+ $210.00","2.5","FVG"]
    ]
  };

  function money(v){ return (v < 0 ? "-$" : "+$") + Math.abs(Number(v)).toFixed(2); }
  function clock(){ return new Date().toLocaleTimeString("en-CA",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"}); }
  function modeLabel(){ return isCrypto() ? "Crypto" : "Futures"; }
  function go(mode, view="overview"){
    state.mode=mode; state.view=view;
    localStorage.setItem("edgeflow-mode",mode); localStorage.setItem("edgeflow-view",view);
    history.replaceState({}, "", "?mode="+mode+"&view="+view);
    render();
  }
  window.enterMode=(m)=>go(m,"overview");
  window.edgeGo=(v)=>go(state.mode,v);
  window.edgeHome=()=>{state.mode=""; localStorage.removeItem("edgeflow-mode"); history.replaceState({}, "", location.pathname); render();};

  function mountain(color, dark){
    return '<svg class="mountain-svg" viewBox="0 0 900 500" preserveAspectRatio="none" aria-hidden="true">'+
      '<defs><linearGradient id="mg'+color.replace("#","")+'" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+color+'" stop-opacity=".9"/><stop offset="1" stop-color="'+dark+'" stop-opacity=".12"/></linearGradient></defs>'+
      '<path d="M0 410 L95 330 L155 360 L250 215 L305 300 L380 175 L455 330 L535 250 L610 320 L700 120 L760 270 L835 210 L900 345 L900 500 L0 500Z" fill="url(#mg'+color.replace("#","")+')"/>'+
      '<path d="M0 440 L115 350 L185 390 L270 275 L350 365 L430 245 L520 375 L610 285 L690 360 L780 205 L900 390 L900 500 L0 500Z" fill="'+color+'" opacity=".22"/>'+
      '<path d="M0 455 L150 390 L240 410 L350 330 L445 405 L560 345 L665 410 L770 330 L900 425" fill="none" stroke="'+color+'" stroke-opacity=".7" stroke-width="2"/>'+
      '</svg>';
  }

  function landing(){
    document.body.className="landing-page";
    root.innerHTML =
      '<div class="landing">'+
        '<div class="land-half land-red"><div class="land-mountains">'+mountain("#ff173f","#170207")+'</div><div class="land-lines"></div></div>'+
        '<div class="land-half land-blue"><div class="land-mountains">'+mountain("#159dff","#031327")+'</div><div class="land-lines"></div></div>'+
        '<div class="land-center">'+
          '<div class="ef-mark">E</div><div class="ef-name">EDGE<span>FLOW</span></div><div class="ef-sub">TRADING INTELLIGENCE</div>'+
          '<div class="choose">CHOOSE YOUR ENVIRONMENT</div>'+
          '<div class="env-grid">'+
            '<button class="env-card red" onclick="enterMode(\'NQ\')"><div class="env-icon">▮▮▮</div><div class="env-title">FUTURES</div><div class="env-sub">MNQ | MES | MGC | etc.</div><div class="env-list">◉ Tradovate<br>◉ Rithmic<br>✦ AI Assistant<br>▣ Journal<br>◫ Analytics</div><span class="env-arrow">→</span></button>'+
            '<button class="env-card blue" onclick="enterMode(\'CRYPTO\')"><div class="env-icon">◉</div><div class="env-title">CRYPTO</div><div class="env-sub">BTC | ETH | SOL | BNB | etc.</div><div class="env-list">◉ KCEX<br>✦ AI Assistant<br>▣ Journal<br>◫ Analytics</div><span class="env-arrow">→</span></button>'+
          '</div>'+
        '</div>'+
        '<div class="landing-foot">DISCIPLINE × DATA × EXECUTION</div><div class="landing-right">A HIGHER STANDARD<br>FOR TRADERS</div>'+
      '</div>';
  }

  const nav = [
    ["overview","⌂","Overview","Core dashboard"],
    ["trades","▤","Trades","Execution history"],
    ["performance","◒","Performance","Stats & expectancy"],
    ["ai","✦","AI Assistant","Edgeflow intelligence"],
    ["journal","▣","Journal","Trading journal"],
    ["analytics","◫","Analytics","Deep statistics"],
    ["backtests","◌","Backtests","Models & samples"],
    ["connections","⌁","Connections","Broker integrations"],
    ["settings","⚙","Settings","Environment controls"]
  ];

  function sidebar(){
    return '<aside class="sidebar">'+
      '<div class="brand" onclick="edgeHome()"><div class="brand-mark">E</div><div><b>EDGE<span>FLOW</span></b><small>TRADING INTELLIGENCE</small></div></div>'+
      '<div class="mode-switch"><button class="'+(!isCrypto()?'on':'')+'" onclick="enterMode(\'NQ\')">FUTURES</button><button class="'+(isCrypto()?'on blue':'')+'" onclick="enterMode(\'CRYPTO\')">CRYPTO</button></div>'+
      '<div class="side-label">WORKSPACE</div><nav>'+nav.slice(0,7).map(n=>'<button class="'+(state.view===n[0]?'active':'')+'" onclick="edgeGo(\''+n[0]+'\')"><i>'+n[1]+'</i><span><b>'+n[2]+'</b><small>'+n[3]+'</small></span></button>').join("")+'</nav>'+
      '<div class="side-label system">SYSTEM</div><nav>'+nav.slice(7).map(n=>'<button class="'+(state.view===n[0]?'active':'')+'" onclick="edgeGo(\''+n[0]+'\')"><i>'+n[1]+'</i><span><b>'+n[2]+'</b><small>'+n[3]+'</small></span></button>').join("")+'</nav>'+
      '<div class="side-status"><b>EDGEFLOW CORE</b><small>'+ (isCrypto()?"KCEX · CRYPTO ENGINE":"TRADOVATE · RITHMIC · FUTURES ENGINE")+'</small><i></i></div>'+
    '</aside>';
  }

  function topbar(){
    return '<header class="topbar"><div class="crumb">EDGEFLOW CORE <span>•</span> '+modeLabel().toUpperCase()+'</div><div class="top-right"><span class="live-dot">● LIVE</span><span class="session-pill">LDN <b>'+clock()+'</b></span><span class="session-pill">NY <b>'+(isCrypto()?"CLOSED":"OPEN")+'</b></span><span class="avatar">N</span><span class="user">Nath⌄</span></div></header>';
  }

  function shell(content){
    document.body.className="app-page "+accent();
    root.innerHTML='<div class="app-shell">'+sidebar()+'<main class="main">'+topbar()+'<section class="workspace">'+content+'</section></main></div>';
  }

  function kpi(label,value,sub,cls=""){
    return '<div class="kpi '+cls+'"><small>'+label+'</small><strong>'+value+'</strong><em>'+sub+'</em></div>';
  }

  function tradeTable(rows=demo[state.mode]){
    return '<div class="trade-table"><div class="tr head"><span>TIME</span><span>SYMBOL</span><span>SIDE</span><span>ENTRY</span><span>EXIT</span><span>QTY</span><span>P&L</span><span>R</span><span>SETUP</span></div>'+
      rows.map(r=>'<div class="tr"><span>'+r[0]+'</span><b>'+r[1]+'</b><span class="'+(r[2].toLowerCase()==="long"?"long":"short")+'">'+r[2]+'</span><span>'+r[3]+'</span><span>'+r[4]+'</span><span>'+r[5]+'</span><strong class="'+(r[6][0]==="-"?"loss":"win")+'">'+r[6]+'</strong><span>'+r[7]+'</span><span>'+r[8]+'</span></div>').join("")+
    '</div>';
  }

  function section(title,body,cls=""){ return '<div class="panel '+cls+'"><div class="panel-title">'+title+'</div>'+body+'</div>'; }

  function dashboard(){
    const crypto=isCrypto();
    const inst=crypto?[["BTC","63,284.50","63","71%"],["ETH","2,452.18","38","66%"],["SOL","148.32","24","62%"],["BNB","573.21","18","61%"]]:[["MNQ","24,856.25","48","62%"],["MES","6,021.75","32","59%"],["MGC","3,872.40","18","67%"]];
    const cards=inst.map(x=>'<div class="instrument"><b>'+x[0]+'</b><strong>'+x[1]+'</strong><small>'+x[2]+' trades <em>'+x[3]+'</em></small></div>').join("");
    return '<div class="dash">'+
      '<div class="dash-hero"><div><small>EDGEFLOW CORE • '+modeLabel().toUpperCase()+'</small><h1>'+modeLabel().toUpperCase()+'</h1><p>'+(crypto?"BTC | ETH | SOL | BNB | XRP | HYPE | FLOKI":"MNQ | MES | MGC | RITHMIC | TRADOVATE")+'</p></div><div class="hero-sessions"><span class="live-dot">● LIVE</span><span>LDN<br><b>'+clock()+'</b></span><span>NY PRE<br><b>08:24:17</b></span><span>NY<br><b>CLOSED</b></span><span>ASIA<br><b>CLOSED</b></span></div></div>'+
      '<div class="kpi-grid">'+kpi("Account Balance","$49,300.00","+0.8%","positive")+kpi("Today P&L","-$120.50","Session result","negative")+kpi("Total P&L","+$3,420.00","Last 30 days","positive")+kpi("Win Rate","62%","48 trades")+kpi("Win / Loss","31 / 19","50 recorded")+kpi("Profit Factor","2.4","Gross / loss")+kpi("Avg RR","3.4","Average R")+'</div>'+
      '<div class="dash-grid"><div class="dash-left">'+
        section(crypto?"TOP COINS":"TOP INSTRUMENTS",'<div class="instrument-grid">'+cards+'</div>')+
        section("RECENT TRADES",tradeTable())+
      '</div><div class="dash-right">'+
        section("SESSION CONTEXT",'<div class="rule"><span>● '+(crypto?"ASIA":"LONDON")+'</span><b>'+clock()+'</b></div><div class="rule"><span>○ NY Open</span><b>in 05:25:43</b></div><div class="rule"><span>○ NY</span><b>Closed</b></div>')+
        section("ACCOUNT RULES",'<div class="rule"><span>Daily Risk</span><b>0% / $1,200</b></div><div class="rule"><span>Consistency</span><b>62%</b></div><div class="rule"><span>Max Drawdown</span><b>2.1%</b></div><div class="rule"><span>Trades Today</span><b>1 / 2</b></div>')+
      '</div></div>'+
      '<div class="bottom-grid">'+section("ACTIVE MODEL",'<div class="active-model">'+(crypto?"CRYPTO RETRACEMENT MODEL":"REJECTION BLOCK MODEL")+'</div><div class="tags"><span>LIMIT</span><span>0.50</span><span>0.62</span><span>0.705</span><span>0.79</span></div>')+
      section("MODEL DISCIPLINE",'<div class="discipline"><div>ENTRY<strong>LIMIT ONLY</strong></div><div>TRIGGER<strong>REJECTION BLOCK</strong></div><div>FILTER<strong>HTF → LTF</strong></div></div>')+'</div>'+
    '</div>';
  }

  function trades(){
    return '<div class="page-title"><div><small>EXECUTION</small><h1>Trades</h1><p>Full execution history for this environment.</p></div><button class="primary" onclick="edgeGo(\'journal\')">+ NEW JOURNAL ENTRY</button></div>'+
      '<div class="filters"><input placeholder="Search instrument, setup..."><select><option>All results</option></select><select><option>All instruments</option></select><button>EXPORT</button></div>'+section("TRADES",tradeTable(demo[state.mode]));
  }

  function performance(){
    return '<div class="page-title"><div><small>PERFORMANCE</small><h1>Performance</h1><p>Risk-adjusted statistics and setup expectancy.</p></div></div>'+
      '<div class="kpi-grid six">'+kpi("Total Trades","48","Last 30 days")+kpi("Win Rate","62%","30 wins / 18 losses")+kpi("Profit Factor","2.4","Gross / loss")+kpi("Avg RR","3.4","Average R")+kpi("Expectancy","+$89.50","Per trade","positive")+kpi("Max DD","2.1%","Account")+'</div>'+
      '<div class="two-col">'+section("PERFORMANCE BY SETUP",tableStats())+section("P&L CALENDAR",calendar())+'</div>';
  }

  function tableStats(){
    const rows=[["R.B + FVG","18","72%","3.6","4.8"],["Sweep + OB","12","58%","2.1","3.2"],["10H Open","8","75%","2.8","3.9"],["News Fade","6","50%","1.6","2.1"],["Trend","4","50%","1.4","1.8"]];
    return '<div class="stats-table"><div class="st head"><span>SETUP</span><span>TRADES</span><span>WIN RATE</span><span>PF</span><span>AVG RR</span></div>'+rows.map(r=>'<div class="st"><b>'+r[0]+'</b><span>'+r[1]+'</span><span>'+r[2]+'</span><span>'+r[3]+'</span><span>'+r[4]+'</span></div>').join("")+'</div>';
  }
  function calendar(){
    return '<div class="calendar"><div class="cal-head">September 2026 <span>‹　›</span></div><div class="week">M T W T F S S</div><div class="days">'+Array.from({length:30},(_,i)=>'<i class="'+([8,15,22,29].includes(i+1)?"good":"")+'">'+(i+1)+'</i>').join("")+'</div></div>';
  }

  function ai(){
    return '<div class="page-title"><div><small>INTELLIGENCE</small><h1>AI Assistant</h1><p>Edgeflow trading intelligence.</p></div><span class="ai-status">● ONLINE</span></div>'+
      '<div class="ai-layout">'+section("EDGEFLOW AI",'<div class="ai-chat"><div class="ai-bubble"><b>Edgeflow AI</b><br>Your trading intelligence is ready.</div><div class="ai-actions"><button>Analyze my last 5 trades</button><button>Check market context (NQ)</button><button>Find potential setups</button><button>Summarize today’s news</button><button>Review my journal</button></div><div class="ai-input">Ask Edgeflow anything... <b>+</b></div></div>','ai-panel')+
      section("MODEL CONTEXT",'<div class="context"><div><small>MODEL</small><b>'+(isCrypto()?"CRYPTO":"FUTURES")+'</b></div><div><small>ENTRY</small><b>LIMIT</b></div><div><small>TRIGGER</small><b>REJECTION BLOCK</b></div><div><small>FIB</small><b>0.5 / 0.62 / 0.705 / 0.79</b></div></div>');
  }

  function journal(){
    return '<div class="page-title"><div><small>JOURNAL</small><h1>Trading Journal</h1><p>Record, review and learn from every execution.</p></div><button class="primary" onclick="newEntry()">+ NEW ENTRY</button></div>'+
      '<div class="journal-layout">'+section("NEW JOURNAL ENTRY",'<form onsubmit="saveEntry(event)" class="journal-form"><input id="jSymbol" placeholder="Symbol" required><select id="jSide"><option>Long</option><option>Short</option></select><input id="jSetup" placeholder="Setup / model"><input id="jPnl" type="number" placeholder="P&L"><textarea id="jNote" placeholder="What happened?"></textarea><button class="primary">SAVE ENTRY</button></form>')+
      section("RECENT JOURNAL", (state.journal.length?state.journal:demo[state.mode].slice(0,4).map(r=>({symbol:r[1],side:r[2],pnl:r[6],setup:r[8],note:"Execution followed the plan."}))).map(x=>'<div class="journal-row"><b>'+x.symbol+'</b><span>'+x.side+'</span><strong>'+x.pnl+'</strong><small>'+x.setup+'</small><p>'+x.note+'</p></div>').join(""))+'</div>';
  }
  window.newEntry=()=>document.getElementById("jSymbol")?.focus();
  window.saveEntry=(e)=>{e.preventDefault();state.journal.unshift({symbol:jSymbol.value,side:jSide.value,pnl:Number(jPnl.value)||0,setup:jSetup.value,note:jNote.value,model:state.mode});localStorage.setItem("edgeflow-journal",JSON.stringify(state.journal));render();};

  function analytics(){
    return '<div class="page-title"><div><small>ANALYTICS</small><h1>Analytics</h1><p>Deep statistics across sessions, instruments and setups.</p></div></div>'+
      '<div class="analytics-grid">'+section("SESSION BREAKDOWN",'<div class="bars">'+["Asia","London","NY AM","NY PM"].map((x,i)=>'<div><span>'+x+'</span><i><b style="width:'+([42,78,61,34][i])+'%"></b></i><em>'+[42,78,61,34][i]+'%</em></div>').join("")+'</div>')+
      section("INSTRUMENT PERFORMANCE",tableStats())+section("EXECUTION DISCIPLINE",'<div class="discipline large"><div>RETRACEMENT<strong>0.5 / 0.62 / 0.705 / 0.79</strong></div><div>ENTRY<strong>LIMIT ONLY</strong></div><div>NO IMPULSE<strong>ENFORCED</strong></div><div>RISK<strong>$100 / TRADE</strong></div></div>')+'</div>';
  }

  function backtests(){
    return '<div class="page-title"><div><small>RESEARCH</small><h1>Backtests</h1><p>Models, samples and historical validation.</p></div><button class="primary">+ NEW BACKTEST</button></div>'+section("BACKTEST LIBRARY",'<div class="backtest-table"><div class="bt head"><span>NAME</span><span>INSTRUMENT</span><span>TRADES</span><span>WIN RATE</span><span>PF</span><span>DATE</span></div>'+[["London R.B Model","MNQ","105","68%","3.2","Sep 19, 2026"],["10H Open Study","MES","75","64%","2.8","Sep 10, 2026"],["Asia Retracement","MGC","52","60%","2.1","Sep 05, 2026"]].map(r=>'<div class="bt"><b>'+r[0]+'</b><span>'+r[1]+'</span><span>'+r[2]+'</span><span>'+r[3]+'</span><span>'+r[4]+'</span><span>'+r[5]+'</span></div>').join("")+'</div>');
  }

  function connections(){
    const con=isCrypto()?[["KCEX","Crypto","blue"],["AI Assistant","Intelligence","green"]]:[["Tradovate","Futures","red"],["Rithmic","Futures","green"],["AI Assistant","Intelligence","green"]];
    return '<div class="page-title"><div><small>SYSTEM</small><h1>Connections</h1><p>Broker and service integrations.</p></div></div><div class="connection-grid">'+con.map(x=>'<div class="connection-card"><div class="conn-logo '+x[2]+'">'+x[0][0]+'</div><h3>'+x[0]+'</h3><small>'+x[1]+'</small><b class="connected">● Connected</b><button>Manage</button></div>').join("")+'</div>';
  }

  function settings(){
    return '<div class="page-title"><div><small>SYSTEM</small><h1>Settings</h1><p>Environment controls and preferences.</p></div></div><div class="settings-grid">'+section("ENVIRONMENT",'<div class="setting"><span>Active Environment</span><b>'+modeLabel()+'</b></div><div class="setting"><span>Theme</span><b>Dark Mode</b></div><div class="setting"><span>Risk per Trade</span><b>$100</b></div>')+section("TRADING MODEL",'<div class="setting"><span>Entry Type</span><b>Limit</b></div><div class="setting"><span>Primary Trigger</span><b>Rejection Block</b></div><div class="setting"><span>Fib Retracements</span><b>0.5 · 0.62 · 0.705 · 0.79</b></div>')+'</div>';
  }

  function render(){
    if(!state.mode){landing();return;}
    const pages={overview:dashboard,trades,performance,ai,journal,analytics,backtests,connections,settings};
    shell((pages[state.view]||dashboard)());
  }
  render();
  setInterval(()=>{document.querySelectorAll(".live-dot").forEach(()=>{});},1000);
})();