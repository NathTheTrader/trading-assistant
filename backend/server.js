import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import multer from "multer";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import os from "node:os";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json({ limit: "15mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 90 * 1024 * 1024 } });

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "trades.json");
const openrouter = process.env.OPENROUTER_API_KEY ? new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.FRONTEND_ORIGIN || "https://naththetrader.github.io",
    "X-OpenRouter-Title": "EDGEFLOW"
  }
}) : null;
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

function convertAIContent(content) {
  if (!Array.isArray(content)) return content;
  return content.map(item => {
    if (item?.type === "input_text") return { type:"text", text:String(item.text || "") };
    if (item?.type === "input_image") return { type:"image_url", image_url:{ url:String(item.image_url || "") } };
    return item;
  });
}
function convertAIInput(input) {
  if (!Array.isArray(input)) return [{ role:"user", content:String(input || "") }];
  return input.map(message => ({ role:message?.role || "user", content:convertAIContent(message?.content) }));
}
function aiText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(x => typeof x === "string" ? x : String(x?.text || x?.content || "")).join("");
  if (content && typeof content === "object") return String(content.text || content.content || "");
  return "";
}
const openai = openrouter ? {
  responses: {
    create: async ({model,input,reasoning}) => {
      const body = {
        model: model || MODEL,
        messages: convertAIInput(input),
        temperature: Number(process.env.OPENROUTER_TEMPERATURE || 0.2),
        max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 4000)
      };
      if (process.env.OPENROUTER_REASONING === "true" && reasoning) body.reasoning = reasoning;
      const r = await openrouter.chat.completions.create(body);
      return { output_text: aiText(r.choices?.[0]?.message?.content), raw:r };
    }
  }
} : null;
const PROFILE_FILE = process.env.PROFILE_FILE || path.join(process.cwd(), "trader-profile.json");
const HISTORICAL_CONTEXT_FILE = process.env.HISTORICAL_CONTEXT_FILE || path.join(process.cwd(), "historical-trading-context.json");
const OBSIDIAN_DIR = process.env.OBSIDIAN_DIR || path.join(process.cwd(), "data", "obsidian");
const OBSIDIAN_TRADES_FILE = path.join(OBSIDIAN_DIR, "trades.json");
const OBSIDIAN_STATUS_FILE = path.join(OBSIDIAN_DIR, "status.json");
const OBSIDIAN_JOB_FILE = path.join(OBSIDIAN_DIR, "analysis-job.json");
const LEARNING_FILE = process.env.LEARNING_FILE || path.join(process.cwd(), "data", "ai-learning.json");
const OBSIDIAN_DAILY_REQUEST_BUDGET = Number(process.env.OBSIDIAN_DAILY_REQUEST_BUDGET || 35);
let obsidianJob = { running:false, phase:"idle", total:0, processed:0, analyzedImages:0, error:null, startedAt:null, finishedAt:null };

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
    ws.on("message",async raw=>{
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

function normalizeObsidianPath(rel) {
  const markers=["CRYPTO/","FUNDED NEW EDGE/","BACKTEST/","Journal/","WEEKLY RECAP/"];
  const lower=rel.toLowerCase();
  for(const marker of markers){
    const i=lower.indexOf(marker.toLowerCase());
    if(i>=0) return rel.slice(i);
  }
  return rel;
}
function parseObsidianModel(rel) {
  const normalized=normalizeObsidianPath(String(rel).replace(/\\/g,"/"));
  if (normalized.startsWith("CRYPTO/")) return "CRYPTO";
  if (normalized.startsWith("FUNDED NEW EDGE/") || normalized.startsWith("BACKTEST/") || normalized.startsWith("Journal/") || normalized.startsWith("WEEKLY RECAP/")) return "NQ";
  return "OTHER";
}
function parseObsidianType(rel) {
  const normalized=normalizeObsidianPath(String(rel).replace(/\\/g,"/"));
  if (normalized.startsWith("CRYPTO/") || normalized.startsWith("FUNDED NEW EDGE/")) return "LIVE";
  if (normalized.startsWith("BACKTEST/")) return "BACKTEST";
  if (normalized.startsWith("Journal/")) return "JOURNAL";
  if (normalized.startsWith("WEEKLY RECAP/")) return "WEEKLY";
  return "OTHER";
}
function firstMatch(text, patterns) {
  for (const re of patterns) { const m=text.match(re); if(m) return String(m[1]||"").trim(); }
  return "";
}
function sectionBody(text, heading, nextHeadings=[]) {
  const lower=text.toLowerCase(), start=lower.indexOf(heading.toLowerCase());
  if(start<0) return "";
  const from=text.slice(start+heading.length).replace(/^\s*\n/,"");
  let end=from.length;
  for(const h of nextHeadings){
    const i=from.toLowerCase().indexOf(h.toLowerCase());
    if(i>=0 && i<end) end=i;
  }
  return from.slice(0,end).replace(/^---\s*/,"").trim();
}
function normalizeOutcome(value, fileName="") {
  const s=String(value||"").toUpperCase().trim();
  if(/^WIN$/.test(s)) return "WIN";
  if(/^LOSS$/.test(s)) return "LOSS";
  if(/^BE$/.test(s)) return "BE";
  if(/\bWIN\b/.test(s) && !/\bLOSS\b/.test(s)) return "WIN";
  if(/\bLOSS\b/.test(s) && !/\bWIN\b/.test(s)) return "LOSS";
  if(/\bBE\b/.test(s) && !/\bWIN\b|\bLOSS\b/.test(s)) return "BE";
  const n=String(fileName).toUpperCase();
  if(/\bLOSS\b/.test(n) && !/\bWIN\b/.test(n)) return "LOSS";
  if(/\bWIN\b/.test(n) && !/\bLOSS\b/.test(n)) return "WIN";
  if(/\bBE\b/.test(n) && !/\bWIN\b|\bLOSS\b/.test(n)) return "BE";
  return "MIXED/UNSPECIFIED";
}
function parseObsidianTrade(rel, text) {
  const fileName=path.basename(rel);
  const model=parseObsidianModel(rel);
  const type=parseObsidianType(rel);
  const instrument=firstMatch(text,[
    /-\s*(?:ES\s*\/\s*NQ|CRYPTO)\s*:\s*([^\n]+)/i
  ]) || ["MNQ","NQ","MES","ES","MGC","BTC","ETH","BNB","SOL","XRP","HYPE","FLOKI"].find(x=>fileName.toUpperCase().includes(x)) || "";
  const session=firstMatch(text,[/-\s*London\s*\/\s*NY AM\s*\/\s*NY PM\s*:\s*([^\n]+)/i]);
  const resultRaw=firstMatch(text,[/WIN;LOSS;BE\s*;\s*([^\n]+)/i]);
  const grade=firstMatch(text,[/##\s*Grade;\s*([^\n]+)/i]);
  const rr=firstMatch(text,[
    /-\s*R\s*:\s*([^\n]+)/i,
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*RR\b/i
  ]);
  const pnl=firstMatch(text,[
    /-\s*\$\s*:\s*([^\n]+)/i,
    /([+-]\d+(?:[.,]\d+)?)\s*(?:US\$?|\$)\b/i
  ]);
  const direction=/\bLONG\b/i.test(fileName)?"LONG":(/\bSHORT\b/i.test(fileName)?"SHORT":"");
  const embeds=[...text.matchAll(/!\[\[([^\]]+)\]\]/g)].map(m=>m[1]);
  const context=sectionBody(text,"## Contexte;",["## Ce que j'ai bien fait;","## Erreurs;","## Leçon du jour;"]);
  const errors=sectionBody(text,"## Erreurs;",["## Leçon du jour;"]);
  const lesson=sectionBody(text,"## Leçon du jour;",[]);
  return {
    id:"obsidian-"+createHash("sha1").update(rel).digest("hex").slice(0,16),
    model,type,sourcePath:rel,fileName,instrument,session,
    outcome:normalizeOutcome(resultRaw,fileName),resultRaw,grade,rr,pnl,direction,
    context:context.slice(0,6000),errors:errors.slice(0,3000),lesson:lesson.slice(0,3000),
    images:embeds.slice(0,20),imageAnalyses:[]
  };
}
async function loadObsidianJob() {
  try { return JSON.parse(await fs.readFile(OBSIDIAN_JOB_FILE,"utf8")); }
  catch { return obsidianJob; }
}
async function saveObsidianJob() {
  await fs.mkdir(OBSIDIAN_DIR,{recursive:true});
  await fs.writeFile(OBSIDIAN_JOB_FILE,JSON.stringify(obsidianJob,null,2));
}
async function normalizePersistedObsidianJob() {
  const saved=await loadObsidianJob();
  if(saved?.running){
    obsidianJob={...saved,running:false,phase:"paused",error:"Analyse interrompue par un redémarrage du serveur. Les images déjà analysées ne seront pas retraitées."};
    await saveObsidianJob();
  } else if(saved) {
    obsidianJob={...obsidianJob,...saved};
  }
}
async function loadObsidianTrades() {
  try { return JSON.parse(await fs.readFile(OBSIDIAN_TRADES_FILE,"utf8")); } catch { return []; }
}
async function loadObsidianStatus() {
  try { return JSON.parse(await fs.readFile(OBSIDIAN_STATUS_FILE,"utf8")); } catch { return {imported:false,markdownFiles:0,imageFiles:0,tradeRecords:0,updatedAt:null}; }
}
async function saveObsidian(trades,status) {
  await fs.mkdir(OBSIDIAN_DIR,{recursive:true});
  await fs.writeFile(OBSIDIAN_TRADES_FILE,JSON.stringify(trades,null,2));
  await fs.writeFile(OBSIDIAN_STATUS_FILE,JSON.stringify(status,null,2));
}
function safeZipTarget(root,entryName) {
  const clean=entryName.replace(/\\/g,"/");
  if(!clean || clean.includes("\0") || clean.split("/").includes("..")) return null;
  const target=path.resolve(root,clean);
  if(target!==root && !target.startsWith(root+path.sep)) return null;
  return target;
}
async function importObsidianZip(buffer) {
  const zip=new AdmZip(buffer);
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"trading-assistant-obsidian-"));
  const root=path.resolve(tmp);
  let markdownFiles=0,imageFiles=0;
  try {
    for(const entry of zip.getEntries()) {
      if(entry.isDirectory) continue;
      const target=safeZipTarget(root,entry.entryName);
      if(!target) continue;
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,entry.getData());
    }
    const found=[];
    async function walk(dir) {
      for(const name of await fs.readdir(dir)) {
        const full=path.join(dir,name);
        const st=await fs.stat(full);
        if(st.isDirectory()) await walk(full);
        else found.push(full);
      }
    }
    await walk(root);
    const all=found.filter(x=>!x.split(path.sep).includes(".obsidian"));
    const imageMap=new Map();
    const imageRoot=path.join(OBSIDIAN_DIR,"images");
    await fs.mkdir(imageRoot,{recursive:true});
    for(const full of all) {
      const ext=path.extname(full).toLowerCase();
      if(![".png",".jpg",".jpeg",".webp"].includes(ext)) continue;
      imageFiles++;
      const data=await fs.readFile(full);
      const base=path.basename(full).replace(/[^a-zA-Z0-9._-]/g,"_");
      const key=createHash("sha1").update(data).digest("hex").slice(0,12)+"-"+base;
      const target=path.join(imageRoot,key);
      await fs.writeFile(target,data);
      imageMap.set(path.basename(full).toLowerCase(),target);
    }
    for(const full of all) {
      if(path.extname(full).toLowerCase()!==".md") continue;
      const relRaw=path.relative(root,full).replace(/\\/g,"/");
      const rel=normalizeObsidianPath(relRaw);
      const text=await fs.readFile(full,"utf8");
      const model=parseObsidianModel(rel);
      if(model==="OTHER") continue;
      markdownFiles++;
      const record=parseObsidianTrade(rel,text);
      record.imageFiles=record.images.map(name=>imageMap.get(path.basename(name).toLowerCase())).filter(Boolean);
      found.push(record);
    }
    const trades=found.filter(x=>x && typeof x==="object" && x.id && x.model).sort((a,b)=>String(a.sourcePath).localeCompare(String(b.sourcePath)));
    const status={imported:true,markdownFiles,imageFiles,tradeRecords:trades.length,updatedAt:new Date().toISOString(),source:"Obsidian ZIP"};
    await saveObsidian(trades,status);
    return status;
  } finally {
    await fs.rm(root,{recursive:true,force:true}).catch(()=>{});
  }
}
async function obsidianImageAnalysisLoop() {
  if(!openai || obsidianJob.running) return;
  const trades=await loadObsidianTrades();
  const items=[];
  for(const trade of trades) {
    for(const file of (trade.imageFiles||[])) {
      const already=trade.imageAnalyses?.some(x=>x.file===file);
      if(!already) items.push({trade,file});
    }
  }
  obsidianJob={...obsidianJob,running:true,phase:"analyzing",total:items.length,processed:0,analyzedImages:0,error:null,startedAt:new Date().toISOString(),finishedAt:null};
  await fs.mkdir(OBSIDIAN_DIR,{recursive:true});
  try {
    for(let i=0;i<items.length;i+=4) {
      const batch=items.slice(i,i+4);
      const content=[{type:"input_text",text:JSON.stringify({
        task:"Analyze these historical trading screenshots for visual evidence only. Do not infer hidden data. For each image, identify chart-visible instrument/timeframe if readable, visible direction/structure, liquidity/sweep, Key Open, FVG/OB/RB, Fib/OTE, entry/SL/TP if visible, and execution quality. Separate FACTS, INTERPRETATION, UNKNOWN. Do not use final P&L as proof of setup quality.",
        modelSeparation:"NQ and CRYPTO remain separate.",
        images:batch.map((x,n)=>({index:n+1,file:path.basename(x.file),model:x.trade.model,instrument:x.trade.instrument,outcome:x.trade.outcome,context:x.trade.context.slice(0,1200)}))
      })}];
      for(const [n,x] of batch.entries()) {
        const data=await fs.readFile(x.file);
        const mime=path.extname(x.file).toLowerCase()===".png"?"image/png":path.extname(x.file).toLowerCase()===".webp"?"image/webp":"image/jpeg";
        content.push({type:"input_image",image_url:"data:"+mime+";base64,"+data.toString("base64"),detail:"high"});
        content.push({type:"input_text",text:"IMAGE_INDEX="+(n+1)+" FILE="+path.basename(x.file)});
      }
      const response=await openai.responses.create({
        model:MODEL,reasoning:{effort:"high"},
        input:[
          {role:"system",content:BASE_SYSTEM+"\nHISTORICAL SCREENSHOT REVIEW: inspect only visible evidence and keep NQ/CRYPTO separated."},
          {role:"user",content}
        ]
      });
      const analysis=response.output_text||"";
      for(const x of batch) {
        const trade=trades.find(t=>t.id===x.trade.id);
        if(trade) (trade.imageAnalyses ||= []).push({file:x.file,analysis,analyzedAt:new Date().toISOString()});
      }
      obsidianJob.processed=Math.min(items.length,i+batch.length);
      obsidianJob.analyzedImages+=batch.length;
      await fs.writeFile(OBSIDIAN_TRADES_FILE,JSON.stringify(trades,null,2));
    }
    obsidianJob={...obsidianJob,running:false,phase:"complete",finishedAt:new Date().toISOString()};
  } catch(e) {
    obsidianJob={...obsidianJob,running:false,phase:"error",error:e.message,finishedAt:new Date().toISOString()};
  }
}
async function loadLearning() {
  try { return JSON.parse(await fs.readFile(LEARNING_FILE,"utf8")); }
  catch { return {version:1,entries:[]}; }
}
async function saveLearningEntry(model,type,content,meta={}) {
  const data=await loadLearning();
  data.entries.push({id:crypto.randomUUID(),timestamp:new Date().toISOString(),model,type,content:String(content||"").slice(0,12000),meta});
  data.entries=data.entries.slice(-200);
  await fs.mkdir(path.dirname(LEARNING_FILE),{recursive:true});
  await fs.writeFile(LEARNING_FILE,JSON.stringify(data,null,2));
  return data.entries[data.entries.length-1];
}
async function loadProfile() {
  try { return JSON.parse(await fs.readFile(PROFILE_FILE, "utf8")); }
  catch { return {}; }
}
async function loadHistoricalContext() {
  try { return JSON.parse(await fs.readFile(HISTORICAL_CONTEXT_FILE, "utf8")); }
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
    return { ok:false, error:"OPENROUTER_API_KEY manquante. Le moteur est prêt mais aucune clé serveur n'est configurée." };
  }
  const profile = await loadProfile();
  const model = normalizeModel(trade?.model || (String(task || "").toUpperCase().includes("CRYPTO") ? "CRYPTO" : "NQ"));
  const historicalContext = await loadHistoricalContext();
  const obsidianStatus = await loadObsidianStatus();
  const obsidianTrades = (await loadObsidianTrades()).filter(t=>t.model===model);
  const learning = (await loadLearning()).entries.filter(x=>x.model===model).slice(-40);
  const payload = {
    traderProfile: profile,
    model,
    historicalContext: historicalContext.models?.[model] || {},
    task,
    currentTrade: trade || null,
    recentHistory: history.slice(-500),
    obsidian: { status: obsidianStatus, tradeRecords: obsidianTrades.slice(-250) },
    learningMemory: learning
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
  const all = await loadTrades();
  const trades = all.filter(t => t.model === model);
  const imported = (await loadObsidianTrades()).filter(t => t.model === model);
  const wins = trades.filter(t => /WIN/i.test(String(t.result || ""))).length;
  const losses = trades.filter(t => /LOSS/i.test(String(t.result || ""))).length;
  const breakeven = trades.filter(t => /BE|BREAK/i.test(String(t.result || ""))).length;
  const rVals = trades.map(t => Number(t.R)).filter(Number.isFinite);
  const avgR = rVals.length ? rVals.reduce((a,b)=>a+b,0) / rVals.length : null;
  const totalR = rVals.length ? rVals.reduce((a,b)=>a+b,0) : null;
  const errors = trades.map(t => String(t.errors || "").trim()).filter(Boolean);
  const lessons = trades.map(t => String(t.lesson || "").trim()).filter(Boolean);
  const setups = trades.map(t => String(t.setupPattern || "").trim()).filter(Boolean);
  const instruments = trades.map(t => String(t.instrument || "").trim()).filter(Boolean);
  const sessions = trades.map(t => String(t.session || "").trim()).filter(Boolean);
  const freq = arr => Object.entries(arr.reduce((a,x)=>{a[x]=(a[x]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,20);
  const monthly = {};
  for (const t of trades) {
    const month=String(t.timestamp||"").slice(0,7)||"unknown";
    (monthly[month] ||= {trades:0,wins:0,losses:0,R:0});
    monthly[month].trades++;
    if(/WIN/i.test(String(t.result||""))) monthly[month].wins++;
    if(/LOSS/i.test(String(t.result||""))) monthly[month].losses++;
    const rr=Number(t.R); if(Number.isFinite(rr)) monthly[month].R+=rr;
  }
  return {
    model, sampleSize:trades.length, wins, losses, breakeven,
    importedSampleSize:imported.length,
    importedOutcomes:Object.entries(imported.reduce((a,t)=>{a[t.outcome]=(a[t.outcome]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]),
    winRate:trades.length?wins/trades.length:null, avgR, totalR,
    dateRange:trades.length?[trades[0].timestamp,trades[trades.length-1].timestamp]:null,
    monthly,
    instruments:freq(instruments), sessions:freq(sessions),
    recurringErrors:freq(errors), recurringLessons:freq(lessons), recurringSetups:freq(setups),
    recentTrades:trades.slice(-40),
    importedRecentTrades:imported.slice(-40)
  };
}

async function buildAIHistory(model) {
  const trades=(await loadTrades()).filter(t=>t.model===model);
  const snapshot=await buildOptimizationSnapshot(model);
  const obsidianTrades=(await loadObsidianTrades()).filter(t=>t.model===model);
  return {model,snapshot,allTradesCount:trades.length,recentDetailedTrades:trades.slice(-200),obsidian:{status:await loadObsidianStatus(),tradeRecords:obsidianTrades.slice(-250)}};
}

async function askVoiceCoach({model,userText,previousTurns=[]}) {
  const aiData=await buildAIHistory(model);
  const profile=await loadProfile();
  const response=await openai.responses.create({
    model:MODEL, reasoning:{effort:"high"},
    input:[
      {role:"system",content:BASE_SYSTEM+"\nVOICE SESSION: ask exactly ONE useful question at a time. Do not dump a lecture."},
      {role:"user",content:JSON.stringify({mode:"BUSINESS_COACH",model,traderProfile:profile,historicalData:aiData,previousTurns:previousTurns.slice(-12),userText})}
    ]
  });
  return response.output_text;
}

app.get("/api/history/ai-context", async (req,res) => {
  const model=normalizeModel(req.query.model);
  const data=await buildAIHistory(model);
  res.json({model,sampleSize:data.allTradesCount,dateRange:data.snapshot.dateRange,historicalContext:(await loadHistoricalContext()).models?.[model]||{},snapshot:data.snapshot,obsidian:data.obsidian});
});

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
    trade:null,history:(await loadTrades()).filter(t=>t.model===model).slice(-500)
  });
  if(result.ok) await saveLearningEntry(model,"daily-review",result.text,{sampleSize:snapshot.sampleSize,importedSampleSize:snapshot.importedSampleSize});
  res.json({...result,model,snapshot,learning:(await loadLearning()).entries.filter(x=>x.model===model).slice(-40)});
});

app.post("/api/coach/question", async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
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
  if(!openrouter) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  return res.status(501).json({ok:false,error:"Le coach vocal nécessite un moteur audio dédié. Le moteur IA texte/images OpenRouter Free est actif; aucune facturation OpenAI n'est utilisée."});
});

app.post("/api/analyze-screen", async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  try{
    const model=normalizeModel(req.body.model);
    if(model!=="CRYPTO") return res.status(400).json({ok:false,error:"Screen observer réservé au modèle CRYPTO."});
    const imageDataUrl=String(req.body.imageDataUrl||"");
    if(!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageDataUrl)) return res.status(400).json({ok:false,error:"Image invalide. Utilise une capture PNG/JPEG/WebP."});
    if(imageDataUrl.length>12000000) return res.status(413).json({ok:false,error:"Capture trop volumineuse."});
    const context=String(req.body.context||"");
    const historicalContext=await loadHistoricalContext();
    const snapshot=await buildOptimizationSnapshot(model);
    const response=await openai.responses.create({
      model:MODEL,
      reasoning:{effort:"high"},
      input:[
        {role:"system",content:BASE_SYSTEM+"\nLIVE SCREEN OBSERVATION MODE: Analyze only what is actually visible in the supplied KCEX screen capture. Do not invent prices, positions, orders, liquidity, or market structure that cannot be read. Separate visible facts from interpretation and hypothesis. Use the CRYPTO model only. This is read-only observation; never instruct automatic execution."},
        {role:"user",content:[
          {type:"input_text",text:JSON.stringify({
            model,
            context,
            historicalContext:historicalContext.models?.[model]||{},
            optimizationSnapshot:snapshot,
            task:"Inspect this current KCEX screen. Extract visible instrument, direction/position if shown, entry/mark/P&L/leverage if shown, visible chart structure, and any immediately visible market context. Then relate only the visible evidence to the Crypto model: market direction -> manipulated Key Open/sweep -> aligned HTF POI -> entry -> high RR. Clearly list missing information and do not infer hidden account state."
          })},
          {type:"input_image",image_url:imageDataUrl,detail:"high"}
        ]}
      ]
    });
    res.json({ok:true,model,text:response.output_text});
  }catch(e){res.status(502).json({ok:false,error:e.message});}
});

app.get("/api/tradovate/status",(req,res)=>res.json(tradovateStatus()));
app.get("/api/tradovate/events",(req,res)=>res.json(liveEvents.slice(-100)));
app.get("/api/tradovate/snapshot",(req,res)=>res.json(tradovateStatus()));
app.post("/api/tradovate/connect",async(req,res)=>{try{await connectTradovate();res.json(tradovateStatus())}catch(e){res.status(502).json({ok:false,error:e.message,status:tradovateStatus()})}});
app.post("/api/tradovate/renew",async(req,res)=>{try{await renewTradovate();res.json(tradovateStatus())}catch(e){res.status(502).json({ok:false,error:e.message})}});

app.get("/api/learning", async (req,res) => {
  const model=normalizeModel(req.query.model);
  const data=await loadLearning();
  res.json({model,entries:data.entries.filter(x=>x.model===model).slice(-100)});
});
app.get("/api/obsidian/status", async (req,res) => {
  const status=await loadObsidianStatus();
  const trades=await loadObsidianTrades();
  const model=normalizeModel(req.query.model);
  const scoped=trades.filter(t=>t.model===model);
  res.json({...status,model,modelTradeRecords:scoped.length,imageAnalyses:scoped.reduce((n,t)=>n+(t.imageAnalyses?.length||0),0),job:obsidianJob});
});
app.post("/api/obsidian/import", upload.single("file"), async (req,res) => {
  if(!req.file) return res.status(400).json({ok:false,error:"ZIP Obsidian manquant."});
  try {
    const status=await importObsidianZip(req.file.buffer);
    res.json({ok:true,status});
  } catch(e) {
    res.status(400).json({ok:false,error:e.message});
  }
});
app.post("/api/obsidian/analyze-images", async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  const status=await loadObsidianStatus();
  if(!status.imported) return res.status(400).json({ok:false,error:"Import Obsidian requis avant l'analyse visuelle."});
  if(obsidianJob.running) return res.json({ok:true,started:false,job:obsidianJob});
  obsidianImageAnalysisLoop().catch(()=>{});
  res.json({ok:true,started:true,job:obsidianJob});
});
app.get("/api/obsidian/job", (req,res)=>res.json(obsidianJob));

app.get("/health", (req,res) => res.json({
  ok:true,
  service:"trading-assistant-bot",
  mode:"READ_ONLY",
  ai:!!openrouter,
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
