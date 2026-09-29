import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
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
You are Trading Assistant, a serious trading-analysis engine for one trader.
You are an analytical assistant, not an execution engine. Never place, cancel, or modify orders.
Your job is to inspect evidence, reason step by step internally, distinguish facts from hypotheses, and give concise actionable observations.

MODEL SEPARATION:
NQ/Futures model: HTF bias -> POI -> liquidity/manipulation -> Fibonacci retracement -> Rejection Block -> limit entry.
Crypto model: market direction -> manipulated/swept Key Open -> aligned HTF POI -> entry -> let the trade play out in high RR. OTE/Fibonacci is secondary.
Never mix the two models or invent undocumented rules.

TRADER PREFERENCES:
The trader focuses on retracements, Rejection Blocks, Fibonacci levels 0.5/0.62/0.705/0.79, liquidity, sweeps, MSS/CHOCH/BOS, FVG/OB/PD arrays and session context.
The trader wants live analysis rather than hindsight validation.
Do not tell the trader what they want to hear. If the evidence is weak, say so.
Do not turn a small sample into a rule. Always report sample size when making a historical observation.
Do not promise profitability or predict a guaranteed outcome.
When reviewing a trade, separate: setup quality, execution quality, market context, news risk, and trader behavior.
When detecting a recurring pattern, state the evidence, sample size, win/loss breakdown when available, and what should be tested next.
`;

const TRADOVATE_API = process.env.TRADOVATE_API_URL || "https://live.tradovateapi.com/v1";
const TRADOVATE_WS = process.env.TRADOVATE_WS_URL || "wss://live.tradovateapi.com/v1/websocket";
const tradovate = {
  ws: null, connected: false, token: null, expirationTime: null, userId: null,
  accounts: [], lastMessageAt: null, requestId: 0, reconnectTimer: null
};
const liveEvents = [];
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
  tradovate.ws.send(endpoint+"\\n"+id+"\\n\\n"+(typeof body==="string"?body:JSON.stringify(body)));
}
async function connectTradovate() {
  if(!tradovate.token || (tradovate.expirationTime && Date.parse(tradovate.expirationTime)<Date.now()+300000)) await tradovateAuth();
  if(tradovate.ws && tradovate.connected) return;
  await new Promise((resolve,reject)=>{
    const ws=new WebSocket(TRADOVATE_WS); tradovate.ws=ws; let settled=false;
    ws.on("open",()=>{tvSend("authorize",tradovate.token); tradovate.heartbeat=setInterval(()=>{try{if(tradovate.ws&&tradovate.ws.readyState===1)tradovate.ws.send("[]")}catch{}},2500)});
    ws.on("message",raw=>{
      tradovate.lastMessageAt=new Date().toISOString();
      let msg; try{msg=JSON.parse(raw.toString())}catch{return}
      emitLive({type:"message",message:msg});
      if(msg?.s===200 && msg?.i===0){tradovate.connected=true;if(!settled){settled=true;resolve();}
        tvSend("user/syncrequest",{splitResponses:true,users:[Number(tradovate.userId)],entityTypes:["account","position","order","fill","cashBalance","contract"]});
      }
      const d=msg?.d;if(!d)return;
      for(const key of ["accounts","positions","orders","fills","cashBalances","contracts"]) if(Array.isArray(d[key])){
        if(key==="accounts") tradovate.accounts=d[key];
        emitLive({type:"entity_update",entity:key,items:d[key]});
        if(key==="fills") for(const fill of d[key]) {
          const detected=cleanTrade({
            timestamp: fill.timestamp || new Date().toISOString(),
            model: "NQ",
            instrument: fill.contractId ? String(fill.contractId) : "NQ",
            direction: /buy|b|long/i.test(String(fill.action ?? fill.buySell ?? "")) ? "LONG" : "SHORT",
            entry: fill.price ?? null,
            risk: 100,
            result: "OPEN",
            context: "Tradovate fill détecté automatiquement en READ ONLY.",
            tags: ["tradovate","live-fill"]
          });
          const trades=await loadTrades(); trades.push(detected); await saveTrades(trades);
          emitLive({type:"trade_fill",fill,trade:detected});
          if(openai) {
            askAI({
              task:"A live Tradovate fill was detected. Analyze it as an observational event only. Do not claim the fill proves setup quality. Identify missing evidence required to judge the NQ model and list the next data that should be attached.",
              trade:detected, history:trades
            }).then(ai=>emitLive({type:"trade_ai_analysis",tradeId:detected.id,analysis:ai.text||ai.error})).catch(e=>emitLive({type:"trade_ai_error",error:e.message}));
          }
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
function tradovateStatus(){return {configured:Boolean(process.env.TRADOVATE_USERNAME&&process.env.TRADOVATE_PASSWORD&&process.env.TRADOVATE_APP_ID&&process.env.TRADOVATE_CID&&process.env.TRADOVATE_SEC),connected:tradovate.connected,userId:tradovate.userId,accounts:tradovate.accounts.map(a=>({id:a.id,name:a.name,active:a.active})),expirationTime:tradovate.expirationTime,lastMessageAt:tradovate.lastMessageAt};}

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

app.get("/api/tradovate/status",(req,res)=>res.json(tradovateStatus()));
app.get("/api/tradovate/events",(req,res)=>res.json(liveEvents.slice(-100)));
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
  const result=await askAI({
    task:`Analyze this trade before judging it. Identify what is documented versus inferred. Check model compliance, HTF/context, POI, liquidity/manipulation, Fib/RB logic, entry quality, R:R, news proximity, execution and trader behavior. Then give: FACTS, STRENGTHS, WEAKNESSES, RISKS, PATTERN LINKS, and WHAT TO TEST NEXT.`,
    trade,
    history:trades
  });
  res.json(result);
});

app.post("/api/chat", async (req,res) => {
  const trades=await loadTrades();
  const result=await askAI({
    task:`Answer the trader's question using the stored trading history as evidence. Compare NQ and Crypto only when explicitly useful and keep their models separate. User question: ${String(req.body.message || "")}`,
    trade:null,
    history:trades
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

app.listen(PORT,()=>console.log(`Trading Assistant backend listening on :${PORT}`));
