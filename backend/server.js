import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI, { toFile } from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json({ limit: "15mb" }));

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "trades.json");
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";
const PROFILE_FILE = process.env.PROFILE_FILE || path.join(process.cwd(), "trader-profile.json");

const BASE_SYSTEM = `
You are TRADING ASSISTANT, the trader's analytical operating system and performance coach.

CORE MISSION
Your primary mission is continuous optimization of the trader's process. Every day, look for the smallest evidence-based improvement that can increase decision quality, execution quality, discipline, research quality, or business process quality. Do NOT optimize for making more trades or for short-term P&L. Optimize the process that produces the trades.

You are not an order-execution engine. Never place, cancel, modify, or recommend an automatic order. Never guarantee a result. You may analyze a live setup, but you must clearly separate what is known now from what is only a hypothesis.

MODEL SEPARATION — ABSOLUTE
NQ/Futures model:
HTF bias -> POI -> liquidity/manipulation -> Fibonacci retracement -> Rejection Block -> limit entry.
Use the trader's documented NQ concepts: FVG, OB, PD array, liquidity, sweep, MSS/CHOCH/BOS, displacement, retracement levels 0.5/0.62/0.705/0.79, session context, R:R, news proximity and execution quality.

Crypto model:
market direction -> manipulated/swept Key Open -> aligned HTF POI -> entry -> let the trade play out in high RR.
OTE/Fibonacci is secondary. Key Open manipulation/sweep and HTF POI alignment are central.

NEVER import an NQ rule into Crypto or a Crypto rule into NQ unless the trader explicitly asks for a cross-model research comparison. If a cross-model comparison is requested, keep the evidence separated.

EVIDENCE DISCIPLINE
1. Facts: directly documented data.
2. Interpretation: the most reasonable reading of those facts.
3. Hypothesis: a pattern that could be true but is not proven.
4. Test: the exact comparison/backtest needed to confirm or reject the hypothesis.
5. Decision: what the trader should do with the information today, without pretending certainty.
Always report sample size when discussing historical patterns. Prefer winners-vs-losers comparisons under similar conditions. Never let a single winning trade validate a setup or a losing trade invalidate it.

DAILY OPTIMIZATION LOOP
At every meaningful review, ask:
- What did the trader do?
- What was the intended model and was it followed?
- What repeated?
- What was different from normal?
- Which error is recurring versus isolated?
- Which condition appears associated with better/worse outcomes?
- What is the highest-value question still unanswered?
- What ONE experiment should be run next?
Do not produce ten changes at once. Prefer one measurable experiment at a time.

TRADING BUSINESS COACHING
Treat trading as a business process, not just chart reading. When the trader asks for business coaching, investigate process consistency, journal/data quality, research/backtesting pipeline, risk discipline, session selection, preparation/review routine, time allocation, decision fatigue/overtrading, sample-size quality, and whether proposed changes are actually testable. Ask direct questions when information is missing. Do not flatter the trader and do not manufacture problems.

VOICE COACH
In voice/business-coach mode, behave like a demanding but concise interviewer. Ask ONE question at a time. Turn vague impressions into measurable actions. If the trader gives a vague answer, ask a precise follow-up. After enough answers, summarize OBSERVATION, EVIDENCE, HYPOTHESIS, NEXT TEST, and ONE COMMITMENT.

COMMUNICATION
Respond in French unless asked otherwise. Be concise during live/voice interaction and more detailed for research. Never tell the trader what they want to hear. If evidence is weak, say so plainly.
`;

const TRADOVATE_API = process.env.TRADOVATE_API_URL || "https://live.tradovateapi.com/v1";
const TRADOVATE_WS = process.env.TRADOVATE_WS_URL || "wss://live.tradovateapi.com/v1/websocket";
const tradovate = {
  ws: null, connected: false, token: null, expirationTime: null, userId: null,
  accounts: [], positions: [], orders: [], fills: [], contracts: new Map(), lastMessageAt: null, requestId: 0, reconnectTimer: null, heartbeat: null, fillIds: new Set(), reconnecting: false
};
const liveEvents = [];
function upsertById(list,item){const id=item?.id??item?.contractId??item?.orderId;if(id==null){list.push(item);return;}const i=list.findIndex(x=>(x?.id??x?.contractId??x?.orderId)===id);if(i>=0)list[i]=item;else list.push(item);if(list.length>1000)list.splice(0,list.length-1000);}
function contractName(id){const c=tradovate.contracts.get(Number(id));return c?.name||c?.symbol||(id?String(id):"NQ");}
function parseFill(fill){const action=String(fill.action??fill.buySell??"").toUpperCase();return cleanTrade({id:"tradovate-fill-"+(fill.id??fill.orderId??Date.now()),timestamp:fill.timestamp||new Date().toISOString(),model:"NQ",instrument:contractName(fill.contractId),direction:/BUY|B|LONG/.test(action)?"LONG":"SHORT",entry:fill.price??null,risk:100,result:"OPEN",context:"Tradovate fill détecté automatiquement en lecture seule.",tags:["tradovate","live-fill"],brokerData:{fillId:fill.id??null,orderId:fill.orderId??null,contractId:fill.contractId??null,qty:fill.qty??null,action}});}
function emitLive(event) {
  liveEvents.push({ timestamp:new Date().toISOString(), ...event });
  if (liveEvents.length > 500) liveEvents.shift();
}
async function tradovateAuth() {
  const required=["TRADOVATE_USERNAME","TRADOVATE_PASSWORD","TRADOVATE_APP_ID","TRADOVATE_CID","TRADOVATE_SEC"];
  const missing=required.filter(k=>!process.env[k]);
  if(missing.length) throw new Error("Missing Tradovate configuration: "+missing.join(", "));
  const response=await fetch(TRADOVATE_API+"/auth/accesstokenrequest",{
    method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({
      name:process.env.TRADOVATE_USERNAME,password:process.env.TRADOVATE_PASSWORD,
      appId:process.env.TRADOVATE_APP_ID,appVersion:process.env.TRADOVATE_APP_VERSION||"1.0.0",
      cid:Number(process.env.TRADOVATE_CID),sec:process.env.TRADOVATE_SEC
    })
  });
  const data=await response.json();
  if(!response.ok||!data.accessToken) throw new Error(data.errorText||"Tradovate authentication failed");
  tradovate.token=data.accessToken; tradovate.expirationTime=data.expirationTime||null; tradovate.userId=data.userId||null;
  emitLive({type:"authenticated",userId:tradovate.userId});
}
function tvSend(endpoint,body="") {
  if(!tradovate.ws) throw new Error("Tradovate WebSocket disconnected");
  const id=tradovate.requestId++;
  tradovate.ws.send(endpoint+"\n"+id+"\n\n"+(typeof body==="string"?body:JSON.stringify(body)));
}
async function connectTradovate() {
  if(!tradovate.token || (tradovate.expirationTime && Date.parse(tradovate.expirationTime)<Date.now()+300000)) await tradovateAuth();
  if(tradovate.ws && tradovate.connected) return;
  await new Promise((resolve,reject)=>{
    const ws=new WebSocket(TRADOVATE_WS); tradovate.ws=ws; let settled=false;
    ws.on("open",()=>{tvSend("authorize",tradovate.token); tradovate.heartbeat=setInterval(()=>{try{if(tradovate.ws&&tradovate.ws.readyState===1)tradovate.ws.send("[]")}catch{}},2500)});
    ws.on("message",raw=>{
      tradovate.lastMessageAt=new Date().toISOString();
      const rawText=raw.toString();
      if(rawText==="o"||rawText==="h") return;
      if(rawText==="c") { emitLive({type:"server_close_frame"}); return; }
      let frames=[];
      try { frames=rawText.startsWith("a[") ? JSON.parse(rawText.slice(1)) : [JSON.parse(rawText)]; } catch { return; }
      for(const msg of (Array.isArray(frames)?frames:[frames])) {
        emitLive({type:"message",message:msg});
        if(msg?.s===200 && msg?.i===0){
          tradovate.connected=true;
          if(!settled){settled=true;resolve();}
          tvSend("user/syncrequest",{splitResponses:true,users:[Number(tradovate.userId)],entityTypes:["account","position","order","fill","cashBalance","contract"]});
        }
        const d=msg?.d;if(!d) continue;
        if(d.entityType && d.entity){
          const entity=d.entity;
          const type=String(d.entityType).toLowerCase();
          if(type==="fill") d.eventType==="Deleted"?null:upsertById(tradovate.fills,entity);
          if(type==="position") upsertById(tradovate.positions,entity);
          if(type==="order") upsertById(tradovate.orders,entity);
          if(type==="account" && d.eventType!=="Deleted") upsertById(tradovate.accounts,entity);
          if(type==="contract") tradovate.contracts.set(Number(entity.id),entity);
          emitLive({type:"entity_event",entityType:d.entityType,eventType:d.eventType});
          if(type==="fill" && d.eventType!=="Deleted"){
            const fill=entity; const fillKey=String(fill.id??(String(fill.orderId)+":"+String(fill.timestamp)+":"+String(fill.price)+":"+String(fill.action)));
            if(!tradovate.fillIds.has(fillKey)){
              tradovate.fillIds.add(fillKey);
              const detected=parseFill(fill); const trades=await loadTrades();
              if(!trades.some(t=>t.id===detected.id)){trades.push(detected);await saveTrades(trades);}
              emitLive({type:"trade_fill",fill,trade:detected});
              if(openai) askAI({task:"A live Tradovate fill was detected. Analyze it observationally only. Do not claim the fill proves setup quality. Identify missing evidence needed to judge the NQ model and list the next data that should be attached.",trade:detected,history:trades.filter(t=>t.model==="NQ")}).then(ai=>emitLive({type:"trade_ai_analysis",tradeId:detected.id,analysis:ai.text||ai.error})).catch(e=>emitLive({type:"trade_ai_error",error:e.message}));
            }
          }
          continue;
        }
        for(const key of ["accounts","positions","orders","fills","cashBalances","contracts"]) if(Array.isArray(d[key])){
          if(key==="accounts") tradovate.accounts=d[key];
          if(key==="positions") tradovate.positions=d[key];
          if(key==="orders") tradovate.orders=d[key];
          if(key==="fills") d[key].forEach(x=>upsertById(tradovate.fills,x));
          if(key==="contracts") for(const contract of d[key]) tradovate.contracts.set(Number(contract.id),contract);
          emitLive({type:"entity_update",entity:key,count:d[key].length});
        }
      }
    });
    ws.on("error",err=>{emitLive({type:"error",error:err.message});if(!settled){settled=true;reject(err)}});
    ws.on("close",()=>{tradovate.connected=false;if(tradovate.heartbeat)clearInterval(tradovate.heartbeat);tradovate.heartbeat=null;emitLive({type:"disconnected"});setTimeout(()=>connectTradovate().catch(e=>emitLive({type:"reconnect_error",error:e.message})),5000);});
  });
}
async function renewTradovate() {
  if(!tradovate.token) return tradovateAuth();
  const response=await fetch(TRADOVATE_API+"/auth/renewaccesstoken",{headers:{Authorization:"Bearer "+tradovate.token}});
  const data=await response.json();
  if(!response.ok||!data.accessToken) throw new Error(data.errorText||"Tradovate token renewal failed");
  tradovate.token=data.accessToken;tradovate.expirationTime=data.expirationTime||null;
}
function tradovateStatus(){return {configured:Boolean(process.env.TRADOVATE_USERNAME&&process.env.TRADOVATE_PASSWORD&&process.env.TRADOVATE_APP_ID&&process.env.TRADOVATE_CID&&process.env.TRADOVATE_SEC),connected:tradovate.connected,userId:tradovate.userId,accounts:tradovate.accounts.map(a=>({id:a.id,name:a.name,active:a.active})),positions:tradovate.positions.map(p=>({...p,instrument:contractName(p.contractId)})),orders:tradovate.orders.slice(-100),recentFills:tradovate.fills.slice(-100).map(f=>({...f,instrument:contractName(f.contractId)})),expirationTime:tradovate.expirationTime,lastMessageAt:tradovate.lastMessageAt};}

async function loadProfile() {
  try { return JSON.parse(await fs.readFile(PROFILE_FILE, "utf8")); }
  catch { return {}; }
}
async function loadTrades() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, "utf8")); }
  catch { return []; }
}
async function saveTrades(trades) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(trades.slice(-5000), null, 2));
}

function cleanTrade(t={}) {
  return {
    id: t.id || crypto.randomUUID(),
    timestamp: t.timestamp || new Date().toISOString(),
    model: t.model || "NQ",
    instrument: t.instrument || "",
    direction: t.direction || "",
    entry: t.entry ?? null,
    stop: t.stop ?? null,
    target: t.target ?? null,
    risk: t.risk ?? null,
    result: t.result || "",
    R: t.R ?? null,
    pnl: t.pnl ?? null,
    session: t.session || "",
    setupPattern: t.setupPattern || "",
    context: t.context || "",
    errors: t.errors || "",
    lesson: t.lesson || "",
    news: t.news || [],
    screenshots: t.screenshots || [],
    tags: t.tags || []
  };
}

async function askAI({task, trade, history=[]}) {
  if (!openai) {
    return { ok:false, error:"OPENAI_API_KEY manquante. Le moteur est prêt mais aucune clé serveur n'est configurée." };
  }
  const profile = await loadProfile();
  const payload = {
    traderProfile: profile,
    task,
    currentTrade: trade || null,
    recentHistory: history.slice(-250)
  };
  const response = await openai.responses.create({
    model: MODEL,
    reasoning: { effort: "high" },
    input: [
      { role:"system", content: BASE_SYSTEM },
      { role:"user", content: JSON.stringify(payload) }
    ]
  });
  return { ok:true, text:response.output_text, model:MODEL };
}


function normalizeModel(value) {
  return String(value || "NQ").toUpperCase() === "CRYPTO" ? "CRYPTO" : "NQ";
}

async function buildOptimizationSnapshot(model) {
  const trades = (await loadTrades()).filter(t => t.model === model);
  const wins = trades.filter(t => /WIN/i.test(String(t.result || ""))).length;
  const losses = trades.filter(t => /LOSS/i.test(String(t.result || ""))).length;
  const rVals = trades.map(t => Number(t.R)).filter(Number.isFinite);
  const avgR = rVals.length ? rVals.reduce((a,b)=>a+b,0) / rVals.length : null;
  const errors = trades.map(t => String(t.errors || "").trim()).filter(Boolean);
  const lessons = trades.map(t => String(t.lesson || "").trim()).filter(Boolean);
  const setups = trades.map(t => String(t.setupPattern || "").trim()).filter(Boolean);
  const freq = arr => Object.entries(arr.reduce((a,x)=>{a[x]=(a[x]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,12);
  return {model,sampleSize:trades.length,wins,losses,winRate:trades.length?wins/trades.length:null,avgR,recentTrades:trades.slice(-20),recurringErrors:freq(errors),recurringLessons:freq(lessons),recurringSetups:freq(setups)};
}

async function askVoiceCoach({model,userText,previousTurns=[]}) {
  const trades=(await loadTrades()).filter(t=>t.model===model).slice(-250);
  const profile=await loadProfile();
  const response=await openai.responses.create({
    model:MODEL, reasoning:{effort:"high"},
    input:[
      {role:"system",content:BASE_SYSTEM+"\nVOICE SESSION: ask exactly ONE useful question at a time. Do not dump a lecture."},
      {role:"user",content:JSON.stringify({mode:"BUSINESS_COACH",model,traderProfile:profile,recentHistory:trades,previousTurns:previousTurns.slice(-12),userText})}
    ]
  });
  return response.output_text;
}

app.get("/api/optimization/daily", async (req,res) => {
  const model=normalizeModel(req.query.model);
  const snapshot=await buildOptimizationSnapshot(model);
  const result=await askAI({
    task:`Run the DAILY OPTIMIZATION REVIEW for ${model}. Do not rewrite the model. Use the evidence snapshot and recent trades. Return exactly:
TODAY'S DIAGNOSIS
WHAT IS WORKING
WHAT IS COSTING THE MOST
ONE HYPOTHESIS
ONE TEST FOR THE NEXT 10-20 TRADES
ONE BEHAVIOR / PROCESS COMMITMENT
ONE QUESTION I SHOULD ANSWER
If sample size is insufficient, say so.`,
    trade:null,history:(await loadTrades()).filter(t=>t.model===model)
  });
  res.json({...result,model,snapshot});
});

app.post("/api/coach/question", async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENAI_API_KEY manquante."});
  const model=normalizeModel(req.body.model);
  const snapshot=await buildOptimizationSnapshot(model);
  const response=await openai.responses.create({
    model:MODEL,reasoning:{effort:"high"},
    input:[
      {role:"system",content:BASE_SYSTEM+"\nBUSINESS INTERVIEW START: ask exactly ONE high-value question in French, grounded in the trader's actual evidence."},
      {role:"user",content:JSON.stringify({model,snapshot,goal:"Start a daily business optimization interview and find the highest-value unresolved bottleneck."})}
    ]
  });
  res.json({ok:true,model,question:response.output_text});
});

app.post("/api/voice/turn", async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENAI_API_KEY manquante."});
  try {
    const model=normalizeModel(req.body.model);
    const audioBase64=String(req.body.audioBase64||"");
    if(!audioBase64) return res.status(400).json({ok:false,error:"Audio manquant."});
    const buffer=Buffer.from(audioBase64,"base64");
    const mime=String(req.body.mimeType||"audio/webm").split(";")[0];
    const ext=mime.includes("mp4")||mime.includes("m4a")?"m4a":mime.includes("wav")?"wav":"webm";
    const transcription=await openai.audio.transcriptions.create({
      file:await toFile(buffer,"voice."+ext),
      model:process.env.OPENAI_TRANSCRIBE_MODEL||"gpt-4o-transcribe",
      response_format:"text"
    });
    const transcript=String(transcription||"").trim();
    const previousTurns=Array.isArray(req.body.previousTurns)?req.body.previousTurns:[];
    const reply=await askVoiceCoach({model,userText:transcript,previousTurns});
    const speech=await openai.audio.speech.create({
      model:process.env.OPENAI_TTS_MODEL||"gpt-4o-mini-tts",
      voice:process.env.OPENAI_TTS_VOICE||"alloy",
      input:reply,response_format:"mp3"
    });
    res.json({ok:true,model,transcript,reply,audioBase64:Buffer.from(await speech.arrayBuffer()).toString("base64")});
  } catch(e) { res.status(502).json({ok:false,error:e.message}); }
});

app.get("/api/tradovate/status",(req,res)=>res.json(tradovateStatus()));
app.get("/api/tradovate/events",(req,res)=>res.json(liveEvents.slice(-100)));
app.get("/api/tradovate/snapshot",(req,res)=>res.json(tradovateStatus()));
app.post("/api/tradovate/connect",async(req,res)=>{try{await connectTradovate();res.json(tradovateStatus())}catch(e){res.status(502).json({ok:false,error:e.message,status:tradovateStatus()})}});
app.post("/api/tradovate/renew",async(req,res)=>{try{await renewTradovate();res.json(tradovateStatus())}catch(e){res.status(502).json({ok:false,error:e.message})}});

app.get("/health", (req,res) => res.json({
  ok:true,
  service:"trading-assistant-bot",
  mode:"READ_ONLY",
  ai:!!openai,
  model:MODEL,
  timestamp:new Date().toISOString()
}));

app.get("/api/profile", async (req,res) => { res.json(await loadProfile()); });

app.get("/api/trades", async (req,res) => {
  const trades=await loadTrades();
  const model=req.query.model;
  res.json(model ? trades.filter(t=>t.model===model) : trades);
});

app.post("/api/trades", async (req,res) => {
  const trades=await loadTrades();
  const trade=cleanTrade(req.body);
  trades.push(trade);
  await saveTrades(trades);
  res.status(201).json(trade);
});

app.post("/api/analyze-trade", async (req,res) => {
  const trades=await loadTrades();
  const trade=cleanTrade(req.body.trade || req.body);
  trade.model = String(trade.model || "NQ").toUpperCase() === "CRYPTO" ? "CRYPTO" : "NQ";
  const result=await askAI({
    task:`Analyze this trade before judging it. Identify what is documented versus inferred. Check model compliance, HTF/context, POI, liquidity/manipulation, Fib/RB logic, entry quality, R:R, news proximity, execution and trader behavior. Then give: FACTS, STRENGTHS, WEAKNESSES, RISKS, PATTERN LINKS, and WHAT TO TEST NEXT.`,
    trade,
    history:trades.filter(t=>t.model===trade.model)
  });
  res.json(result);
});

app.post("/api/chat", async (req,res) => {
  const trades=await loadTrades();
  const model=String(req.body.model||"NQ").toUpperCase()==="CRYPTO"?"CRYPTO":"NQ";
  const result=await askAI({
    task:`Answer the trader's question using ONLY the ${model} model and its stored trading history. Never import rules or trades from the other model. User question: ${String(req.body.message || "")}`,
    trade:null,
    history:trades.filter(t=>t.model===model)
  });
  res.json(result);
});

app.get("/api/patterns", async (req,res) => {
  const trades=await loadTrades();
  const model=req.query.model;
  const scoped=model ? trades.filter(t=>t.model===model) : trades;
  const groups = {};
  for (const t of scoped) {
    const key = [t.model,t.instrument,t.session,t.setupPattern].map(x=>String(x||"").trim()).join("|");
    if (!key.replace(/\\|/g,"")) continue;
    (groups[key] ||= []).push(t);
  }
  const stats = Object.entries(groups).map(([key,items])=>{
    const wins=items.filter(x=>String(x.result).toUpperCase().includes("WIN")).length;
    const losses=items.filter(x=>String(x.result).toUpperCase().includes("LOSS")).length;
    const rVals=items.map(x=>Number(x.R)).filter(Number.isFinite);
    return {key,n:items.length,wins,losses,winRate:items.length?wins/items.length:null,avgR:rVals.length?rVals.reduce((a,b)=>a+b,0)/rVals.length:null};
  }).filter(x=>x.n>=3).sort((a,b)=>b.n-a.n);
  const result=await askAI({
    task:`Find recurring patterns in the historical trades. Use the deterministic statistics below as evidence. Do not invent patterns. Require meaningful sample size, report sample size and win/loss data, distinguish correlation from causation, and state what should be tested next. Deterministic stats: ${JSON.stringify(stats.slice(0,100))}`,
    trade:null,
    history:scoped
  });
  res.json({...result,deterministicStats:stats.slice(0,100)});
});

app.listen(PORT,()=>{console.log(`Trading Assistant backend listening on :${PORT}`); if(process.env.TRADOVATE_USERNAME&&process.env.TRADOVATE_PASSWORD&&process.env.TRADOVATE_APP_ID&&process.env.TRADOVATE_CID&&process.env.TRADOVATE_SEC){connectTradovate().catch(e=>emitLive({type:"startup_connect_error",error:e.message}));}});
