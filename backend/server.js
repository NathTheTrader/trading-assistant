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
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://naththetrader.github.io";
function requirePrivateRequest(req,res,next){
  const accessKey=process.env.EDGEFLOW_ACCESS_KEY || "";
  const provided=String(req.get("x-edgeflow-access")||"");
  const origin=String(req.get("origin")||"");
  if(accessKey && provided===accessKey) return next();
  if(origin===FRONTEND_ORIGIN) return next();
  return res.status(403).json({ok:false,error:"EDGEFLOW private endpoint."});
}
const EDGEFLOW_STORAGE_ROOT = process.env.EDGEFLOW_STORAGE_ROOT || path.join(process.cwd(),"data");
const DATA_FILE = process.env.DATA_FILE || path.join(EDGEFLOW_STORAGE_ROOT,"trades.json");
const openrouter = process.env.OPENROUTER_API_KEY ? new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": process.env.FRONTEND_ORIGIN || "https://naththetrader.github.io",
    "X-OpenRouter-Title": "EDGEFLOW"
  }
}) : null;

const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "")
  .trim()
  .replace(/^(['"])(.*)\\1$/s,"$2")
  .replace(/\\s+/g,"");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_FALLBACK_MODELS = String(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.5-flash")
  .split(",").map(x=>x.trim()).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const FALLBACK_MODELS = String(process.env.OPENROUTER_FALLBACK_MODELS || "").split(",").map(x=>x.trim()).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);
const AI_PROVIDER = GEMINI_API_KEY ? "gemini" : (process.env.OPENROUTER_API_KEY ? "openrouter" : "none");
const AI_PRIMARY_MODEL = AI_PROVIDER==="gemini" ? GEMINI_MODEL : MODEL;
const AI_ENGINE_VERSION = "2.1";
const AI_GRADE_SCALE = "A+ exceptionnellement propre; A solide; A- solide avec petite imperfection; B+ bon avec imperfection claire; B bon mais faiblesse identifiable; B- limite; C+/C qualité limite; NO TRADE si killer ou modele non respecte.";
const MODEL_CONTRACTS = {
  NQ:{
    label:"FUTURES / NQ",
    sequence:"HTF bias -> POI -> liquidity/manipulation -> displacement -> retracement -> Rejection Block -> limit entry",
    mustCheck:["HTF bias","POI","liquidity/sweep/manipulation","displacement/impulse quality","Fibonacci 0.5 / 0.62 / 0.705 / 0.79","Rejection Block","limit entry location","SL","R:R","session/timing","news"],
    entryStyle:"Retracement propre uniquement. Signaler explicitement trop tôt, pas assez deep, trop tard ou mal placé. Ne pas valoriser une entrée prise sur l'impulsion.",
    realityRule:"Le live market peut dévier de la théorie parfaite. Utiliser le modèle comme cadre, pas comme règle mécanique."
  },
  CRYPTO:{
    label:"CRYPTO",
    sequence:"market direction -> manipulated/swept Key Open -> aligned HTF POI -> entry -> high RR",
    mustCheck:["market direction","Key Open manipulation/sweep","HTF POI alignment","entry location","high-RR logic","context/news/invalidations"],
    entryStyle:"OTE/Fibonacci est secondaire. Ne pas importer la hiérarchie Futures/R.B. dans Crypto.",
    realityRule:"Le live market peut dévier de la théorie parfaite. Juger d'abord les preuves visibles et la cohérence du modèle Crypto."
  }
};

function convertAIContent(content) {
  if (!Array.isArray(content)) return [{type:"text",text:String(content||"")}];
  return content.map(item => {
    if (item?.type === "input_text") return { type:"text", text:String(item.text || "") };
    if (item?.type === "input_image") return { type:"image_url", image_url:{ url:String(item.image_url || "") } };
    return item;
  });
}
function convertAIInput(input) {
  if (!Array.isArray(input)) return [{ role:"user", content:String(input || "") }];
  return input.map(message => {
    const role=message?.role || "user";
    const content=convertAIContent(message?.content);
    // Gemini OpenAI compatibility expects plain text for text-only messages
    // and an array only when multimodal content (images) is actually present.
    const multimodal=content.some(item => item?.type==="image_url");
    return { role, content: multimodal ? content : content.map(item => String(item?.text||"")).join("\n") };
  });
}
function aiText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(x => typeof x === "string" ? x : String(x?.text || x?.content || "")).join("");
  if (content && typeof content === "object") return String(content.text || content.content || "");
  return "";
}

function parseGeminiDataUrl(value) {
  const m=String(value||"").match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i);
  return m ? {mimeType:m[1].toLowerCase(),data:m[2]} : null;
}
function geminiParts(content) {
  const parts=[];
  const items=Array.isArray(content)?content:[{type:"input_text",text:String(content||"")}];
  for(const item of items){
    if(item?.type==="input_text" || item?.type==="text"){
      const text=String(item.text||""); if(text) parts.push({text});
      continue;
    }
    if(item?.type==="input_image"){
      const image=parseGeminiDataUrl(item.image_url);
      if(image) parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
      continue;
    }
    if(item?.type==="image_url"){
      const image=parseGeminiDataUrl(item.image_url?.url);
      if(image) parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
    }
  }
  return parts;
}
function buildGeminiRequest(input) {
  const contents=[];
  const systemParts=[];
  for(const message of (Array.isArray(input)?input:[{role:"user",content:String(input||"")}])) {
    const role=String(message?.role||"user");
    const parts=geminiParts(message?.content);
    if(!parts.length) continue;
    if(role==="system"){
      systemParts.push(...parts.filter(p=>p.text).map(p=>p.text));
      continue;
    }
    contents.push({role:role==="assistant"?"model":"user",parts});
  }
  const body={contents};
  if(systemParts.length) body.systemInstruction={parts:[{text:systemParts.join("\n\n")}]};
  return body;
}
function mapGeminiThinking(reasoning) {
  const effort=String(reasoning?.effort||"medium").toLowerCase();
  return effort==="high"?"high":effort==="low"?"low":effort==="minimal"?"minimal":"medium";
}
async function callGeminiNative({model,input}) {
  const endpoint="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(GEMINI_API_KEY);
  const body=buildGeminiRequest(input);
  body.generationConfig={
    maxOutputTokens:Number(process.env.GEMINI_MAX_OUTPUT_TOKENS||8000),
    thinkingConfig:{thinkingLevel:"medium"}
  };
  const response=await fetch(endpoint,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data?.error?.message||("Gemini native API error "+response.status));
    error.status=response.status;
    error.code=data?.error?.status||data?.error?.code||null;
    throw error;
  }
  const outputText=(data?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(p=>String(p?.text||"")).join("");
  if(!outputText){
    const reason=String(data?.candidates?.[0]?.finishReason||"EMPTY_RESPONSE");
    const error=new Error("Gemini native API returned no text (finishReason="+reason+").");
    error.status=502;
    throw error;
  }
  return {output_text:outputText,raw:data,model};
}

async function callGemini({model,input,reasoning}) {
  // Use Gemini's OpenAI-compatible endpoint with Bearer authentication.
  // This is the supported path for current Gemini authorization (AQ/auth) keys
  // and also accepts the same OpenAI-style multimodal message format Edgeflow already uses.
  const geminiBase=(process.env.GEMINI_OPENAI_BASE_URL||"https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/+$/,"");
  const endpoint=geminiBase+"/chat/completions";
  const messages=convertAIInput(input);
  const body={
    model,
    messages,
    max_tokens:Number(process.env.GEMINI_MAX_OUTPUT_TOKENS||8000)
  };
  const effort=mapGeminiThinking(reasoning);
  if(effort && effort!=="medium") body.reasoning_effort=effort;
  const response=await fetch(endpoint,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+GEMINI_API_KEY
    },
    body:JSON.stringify(body)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data?.error?.message||("Gemini API error "+response.status));
    error.status=response.status;
    error.code=data?.error?.status||data?.error?.code||null;
    throw error;
  }
  const outputText=aiText(data?.choices?.[0]?.message?.content);
  if(!outputText){
    const finishReason=String(data?.choices?.[0]?.finish_reason||"EMPTY_RESPONSE");
    const error=new Error("Gemini returned no text (finishReason="+finishReason+").");
    error.status=502;
    throw error;
  }
  return {output_text:outputText,raw:data,model};
}

const openai = (GEMINI_API_KEY || openrouter) ? {
  responses: {
    create: async ({model,input,reasoning}) => {
      let geminiLastError=null;
      if(GEMINI_API_KEY){
        const candidates=[GEMINI_MODEL,...GEMINI_FALLBACK_MODELS].filter((x,i,a)=>a.indexOf(x)===i);
        for(const candidate of candidates){
          try{
            return await callGemini({model:candidate,input,reasoning});
          }catch(error){
            geminiLastError=error;
            const status=Number(error?.status||0);
            if(status!==429 && status!==500 && status!==502 && status!==503 && status!==504) break;
          }
        }
      }
      if(openrouter){
        const candidates=[model||MODEL,...FALLBACK_MODELS].filter((x,i,a)=>a.indexOf(x)===i);
        await reserveAIRequest();
        let lastError=null;
        for(const candidate of candidates){
          const body={model:candidate,messages:convertAIInput(input),temperature:Number(process.env.OPENROUTER_TEMPERATURE||0.2),max_tokens:Number(process.env.OPENROUTER_MAX_TOKENS||8000)};
          if(process.env.OPENROUTER_REASONING!=="false"&&reasoning) body.reasoning=reasoning;
          try{
            const r=await openrouter.chat.completions.create(body);
            return {output_text:aiText(r.choices?.[0]?.message?.content),raw:r,model:candidate};
          }catch(error){
            lastError=error;
            const status=Number(error?.status||error?.response?.status||0);
            const detail=String(error?.message||"").toLowerCase();
            if(status===429 && /(free-models-per-day|free.*daily|daily.*free)/i.test(detail)) throw error;
            if(status!==429) throw error;
          }
        }
        throw lastError||geminiLastError||new Error("AI request failed.");
      }
      throw geminiLastError||new Error("AI request failed.");
    }
  }
} : null;
const PROFILE_FILE = process.env.PROFILE_FILE || path.join(EDGEFLOW_STORAGE_ROOT,"trader-profile.json");
const HISTORICAL_CONTEXT_FILE = process.env.HISTORICAL_CONTEXT_FILE || path.join(EDGEFLOW_STORAGE_ROOT,"historical-trading-context.json");
const OBSIDIAN_DIR = process.env.OBSIDIAN_DIR || path.join(EDGEFLOW_STORAGE_ROOT,"obsidian");
const OBSIDIAN_TRADES_FILE = path.join(OBSIDIAN_DIR,"trades.json");
const OBSIDIAN_STATUS_FILE = path.join(OBSIDIAN_DIR,"status.json");
const OBSIDIAN_JOB_FILE = path.join(OBSIDIAN_DIR,"analysis-job.json");
const LEARNING_FILE = process.env.LEARNING_FILE || path.join(EDGEFLOW_STORAGE_ROOT,"ai-learning.json");
const OBSIDIAN_DAILY_REQUEST_BUDGET = Number(process.env.OBSIDIAN_DAILY_REQUEST_BUDGET || 35);
const OBSIDIAN_IMAGE_BATCH_SIZE = Math.max(1,Math.min(2,Number(process.env.OBSIDIAN_IMAGE_BATCH_SIZE || 1)));
let obsidianJob = { running:false, phase:"idle", total:0, processed:0, analyzedImages:0, error:null, startedAt:null, finishedAt:null,currentFile:null,currentModel:null };
async function reserveAIRequest() {
  const limit = Number(process.env.OPENROUTER_DAILY_REQUEST_LIMIT || 0);
  if (!Number.isFinite(limit) || limit <= 0) return { unlimited: true };
  const file=path.join(EDGEFLOW_STORAGE_ROOT,"ai-usage.json");
  const today=new Date().toISOString().slice(0,10);
  let usage={date:today,requests:0};
  try {
    usage=JSON.parse(await fs.readFile(file,"utf8"));
    if(usage.date!==today) usage={date:today,requests:0};
  } catch {}
  if(usage.requests>=limit) {
    const e=new Error("Daily AI request limit reached.");
    e.status=429;
    throw e;
  }
  usage.requests++;
  await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,JSON.stringify(usage,null,2));
  return usage;
}

const BASE_SYSTEM = `
You are JARVIS, the trader's analytical operating system and performance coach.

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
function parseOrder(order){const action=String(order.action??order.buySell??"").toUpperCase();return cleanTrade({id:"tradovate-order-"+(order.id??Date.now()),timestamp:order.timestamp||new Date().toISOString(),model:"NQ",instrument:contractName(order.contractId),direction:/BUY|B|LONG/.test(action)?"LONG":"SHORT",entry:order.price??order.limitPrice??order.stopPrice??null,risk:100,result:"OPEN",context:"Ordre Tradovate détecté automatiquement en lecture seule.",tags:["tradovate","live-order"],brokerData:{orderId:order.id??null,contractId:order.contractId??null,qty:order.qty??null,action,ordStatus:order.ordStatus??null,orderType:order.orderType??order.ordType??null}});}
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
          if(type==="order") {
            upsertById(tradovate.orders,entity);
            if(d.eventType!=="Deleted" && ["Created","Updated"].includes(String(d.eventType||""))){
              const order=entity,orderKey="tradovate-order-event-"+String(order.id||order.timestamp||Date.now());
              if(!tradovate.fillIds.has(orderKey)){
                tradovate.fillIds.add(orderKey);
                const detectedOrder=parseOrder(order);
                emitLive({type:"trade_order",order,trade:detectedOrder});
              }
            }
          }
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
function tradovateStatus(){const required=["TRADOVATE_USERNAME","TRADOVATE_PASSWORD","TRADOVATE_APP_ID","TRADOVATE_CID","TRADOVATE_SEC"];const missing=required.filter(k=>!process.env[k]);return {configured:missing.length===0,missing,connected:tradovate.connected,userId:tradovate.userId,accounts:tradovate.accounts.map(a=>({id:a.id,name:a.name,active:a.active})),positions:tradovate.positions.map(p=>({...p,instrument:contractName(p.contractId)})),orders:tradovate.orders.slice(-100),recentFills:tradovate.fills.slice(-100).map(f=>({...f,instrument:contractName(f.contractId)})),expirationTime:tradovate.expirationTime,lastMessageAt:tradovate.lastMessageAt};}

function normalizeObsidianPath(rel) {
  const markers=["CRYPTO/","FUNDED NEW EDGE/","BACKTEST/","Journal/","WEEKLY RECAP/"];
  const lower=rel.toLowerCase();
  for(const marker of markers){
    const i=lower.indexOf(marker.toLowerCase());
    if(i>=0) return rel.slice(i);
  }
  return rel;
}
function parseObsidianModel(rel,text="") {
  const normalized=String(rel).replace(/\\/g,"/").toUpperCase();
  const body=String(text||"").toUpperCase();
  if(/(?:^|[/\\])CRYPTO(?:[/\\]|$)/.test(normalized) || (/\b(KEY OPEN|KCEX)\b/.test(body) && /\b(BTC|ETH|SOL|BNB|XRP|HYPE|FLOKI|CRYPTO)\b/.test(body))) return "CRYPTO";
  if(/(?:^|[/\\])(FUNDED NEW EDGE|BACKTEST|JOURNAL|WEEKLY RECAP)(?:[/\\]|$)/.test(normalized)) return "NQ";
  if(/\b(?:NQ|MNQ|MES|MGC|ES)\b/.test(normalized+" "+body)) return "NQ";
  return "OTHER";
}
function parseObsidianType(rel,text="") {
  const normalized=String(rel).replace(/\\/g,"/").toUpperCase();
  const body=String(text||"").toUpperCase();
  if(/(?:^|[/\\])BACKTEST(?:[/\\]|$)/.test(normalized) || /\bBACKTEST\b/.test(body)) return "BACKTEST";
  if(/(?:^|[/\\])JOURNAL(?:[/\\]|$)/.test(normalized)) return "JOURNAL";
  if(/(?:^|[/\\])WEEKLY RECAP(?:[/\\]|$)/.test(normalized) || /\bWEEKLY RECAP\b/.test(body)) return "WEEKLY";
  if(parseObsidianModel(rel,text)==="CRYPTO" || /(?:^|[/\\])FUNDED NEW EDGE(?:[/\\]|$)/.test(normalized)) return "LIVE";
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
      const model=parseObsidianModel(rel,text);
      const looksLikeTrade=/\b(?:trade|recap|backtest|entry|stop|target|win|loss|journal|setup|key open|rejection block|fvg|fib)\b/i.test(text+" "+rel);
      if(model==="OTHER" && !looksLikeTrade) continue;
      markdownFiles++;
      const record=parseObsidianTrade(rel,text);
      if(model!=="OTHER") record.model=model;
      else {
        record.model=/\b(?:KEY OPEN|KCEX|BTC|ETH|SOL|BNB|XRP|HYPE|FLOKI|CRYPTO)\b/i.test(text) ? "CRYPTO" : "NQ";
        record.parseWarning="Mode détecté automatiquement par le contenu.";
      }
      const parsedType=parseObsidianType(rel,text);
      record.type=parsedType==="OTHER"?"JOURNAL":parsedType;
      record.imageFiles=record.images.map(name=>imageMap.get(path.basename(name).toLowerCase())).filter(Boolean);
      found.push(record);
    }
    const trades=found.filter(x=>x && typeof x==="object" && x.id && x.model).sort((a,b)=>String(a.sourcePath).localeCompare(String(b.sourcePath)));
    const status={imported:true,markdownFiles,imageFiles,tradeRecords:trades.length,updatedAt:new Date().toISOString(),source:"Obsidian ZIP"};
    await saveObsidian(trades,status);
    obsidianJob={running:false,phase:"imported",total:imageFiles,processed:0,analyzedImages:0,error:null,startedAt:null,finishedAt:null,currentFile:null,currentModel:null};
    await saveObsidianJob();
    return status;
  } finally {
    await fs.rm(root,{recursive:true,force:true}).catch(()=>{});
  }
}
async function obsidianImageAnalysisLoop() {
  const trades=await loadObsidianTrades();
  const items=[];
  for(const trade of trades) {
    if(!["NQ","CRYPTO"].includes(trade.model)) continue;
    const imageFiles=Array.isArray(trade.imageFiles)&&trade.imageFiles.length
      ? trade.imageFiles
      : (trade.images||[]).map(name=>path.join(OBSIDIAN_DIR,"images",path.basename(name)));
    for(const file of imageFiles) {
      try { await fs.access(file); } catch { continue; }
      if(!(trade.imageAnalyses||[]).some(x=>x.file===file)) items.push({trade,file});
    }
  }

  const savedJob=await loadObsidianJob();
  const previousProcessed=Number(savedJob?.processed||0);
  const allImageCount=trades.reduce((n,t)=>n+((t.images||[]).filter(Boolean).length),0);
  const completedBeforeRun=Math.max(0,allImageCount-items.length);
  obsidianJob={
    running:true,phase:"analyzing",total:allImageCount,processed:completedBeforeRun,
    analyzedImages:completedBeforeRun,error:null,startedAt:savedJob?.startedAt||new Date().toISOString(),finishedAt:null,
    currentFile:null,currentModel:null
  };
  await saveObsidianJob();

  if(!items.length) {
    obsidianJob={...obsidianJob,running:false,phase:"complete",finishedAt:new Date().toISOString()};
    await saveObsidianJob();
    return;
  }

  try {
    for(let i=0;i<items.length;i+=OBSIDIAN_IMAGE_BATCH_SIZE) {
      const usageFile=path.join(EDGEFLOW_STORAGE_ROOT,"ai-usage.json");
      let usage={date:new Date().toISOString().slice(0,10),requests:0};
      try {
        usage=JSON.parse(await fs.readFile(usageFile,"utf8"));
        if(usage.date!==new Date().toISOString().slice(0,10)) usage={date:new Date().toISOString().slice(0,10),requests:0};
      } catch {}
      if(AI_PROVIDER!=="gemini" && usage.requests >= OBSIDIAN_DAILY_REQUEST_BUDGET) {
        obsidianJob={...obsidianJob,running:false,phase:"paused-rate-limit",
          error:"Budget screenshots atteint pour aujourd'hui ("+OBSIDIAN_DAILY_REQUEST_BUDGET+" requêtes réservées). Progression sauvegardée; relance demain pour reprendre."};
        await saveObsidianJob();
        return;
      }

      const batch=items.slice(i,i+OBSIDIAN_IMAGE_BATCH_SIZE);
      obsidianJob.currentFile=batch.map(x=>path.basename(x.file)).join(", ");
      obsidianJob.currentModel=batch[0]?.trade?.model||null;
      await saveObsidianJob();
      const content=[{type:"input_text",text:JSON.stringify({
        task:"Analyze these historical trading screenshots for visual evidence only. Return one clearly separated section per IMAGE_INDEX. Do not infer hidden data. Identify chart-visible instrument/timeframe if readable, visible direction/structure, liquidity/sweep, Key Open, FVG/OB/RB, Fib/OTE, entry/SL/TP if visible, and execution quality. Separate FACTS, INTERPRETATION, UNKNOWN.",
        modelSeparation:"NQ and CRYPTO remain separate.",
        images:batch.map((x,n)=>({index:n+1,file:path.basename(x.file),model:x.trade.model,instrument:x.trade.instrument,outcome:x.trade.outcome,context:x.trade.context.slice(0,900)}))
      })}];

      for(const [n,x] of batch.entries()) {
        const data=await fs.readFile(x.file);
        const ext=path.extname(x.file).toLowerCase();
        const mime=ext===".png"?"image/png":ext===".webp"?"image/webp":"image/jpeg";
        content.push({type:"input_image",image_url:"data:"+mime+";base64,"+data.toString("base64"),detail:"high"});
        content.push({type:"input_text",text:"IMAGE_INDEX="+(n+1)+" FILE="+path.basename(x.file)});
      }

      let response;
      try {
        response=await callGemini({
          model:GEMINI_MODEL,
          input:[
            {role:"system",content:BASE_SYSTEM+"\nHISTORICAL SCREENSHOT REVIEW: inspect only visible evidence and keep NQ/CRYPTO separated."},
            {role:"user",content}
          ]
        });
      } catch(e) {
        if(e?.status===429 || /rate.?limit|too many requests|free.*limit/i.test(String(e?.message||""))) {
          obsidianJob={...obsidianJob,running:false,phase:"paused-rate-limit",
            error:"Limite IA atteinte. Progression sauvegardée; relance plus tard pour reprendre sans retraiter les images."};
          await saveObsidianJob();
          return;
        }
        if(e?.status===400 && /context.?length|token|too large/i.test(String(e?.message||""))) {
          obsidianJob={...obsidianJob,running:false,phase:"paused-context-limit",
            error:"Une image est trop lourde pour le contexte du modèle. Compression/lot réduit requis : "+path.basename(batch[0]?.file||"inconnu")};
          await saveObsidianJob();
          return;
        }
        throw e;
      }

      const analysis=String(response.output_text||"");
      const imageSections=analysis.split(/\n(?=\s*(?:IMAGE_INDEX\s*=\s*|IMAGE\s*(?:INDEX|#)?\s*)\d+)/i).map(x=>x.trim()).filter(Boolean);
      for(const [n,x] of batch.entries()) {
        const trade=trades.find(t=>t.id===x.trade.id);
        if(!trade) continue;
        const marker=new RegExp("^(?:IMAGE_INDEX\\s*=\\s*|IMAGE\\s*(?:INDEX|#)?\\s*)"+(n+1)+"\\b","i");
        const section=imageSections.find(part=>marker.test(part)) || analysis;
        (trade.imageAnalyses ||= []).push({
          file:x.file,imageIndex:n+1,analysis:section.slice(0,14000),analyzedAt:new Date().toISOString()
        });
      }
      obsidianJob.processed=Math.min(obsidianJob.total,obsidianJob.processed+batch.length);
      obsidianJob.analyzedImages=Math.min(obsidianJob.total,obsidianJob.analyzedImages+batch.length);
      obsidianJob.currentFile=null;obsidianJob.currentModel=null;
      await fs.writeFile(OBSIDIAN_TRADES_FILE,JSON.stringify(trades,null,2));
      await saveObsidianJob();
    }

    obsidianJob={...obsidianJob,running:false,phase:"complete",finishedAt:new Date().toISOString(),error:null,currentFile:null,currentModel:null};
    await saveObsidianJob();
  } catch(e) {
    obsidianJob={...obsidianJob,running:false,phase:"error",error:e.message,finishedAt:new Date().toISOString()};
    await saveObsidianJob();
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

function compactTradeForAI(t={}){
  return {timestamp:t.timestamp||null,model:t.model||null,instrument:t.instrument||null,direction:t.direction||null,entry:t.entry??null,stop:t.stop??null,target:t.target??null,risk:t.risk??null,result:t.result||null,R:t.R??null,pnl:t.pnl??null,session:t.session||null,setupPattern:t.setupPattern||null,context:String(t.context||"").slice(0,1800),errors:String(t.errors||"").slice(0,1200),lesson:String(t.lesson||"").slice(0,1200),news:Array.isArray(t.news)?t.news.slice(0,8):[],tags:Array.isArray(t.tags)?t.tags.slice(0,12):[]};
}
function buildModelContract(model){return MODEL_CONTRACTS[model]||MODEL_CONTRACTS.NQ;}
function evidenceStats(trades=[]){
  const wins=trades.filter(t=>/WIN/i.test(String(t.result||""))).length;
  const losses=trades.filter(t=>/LOSS/i.test(String(t.result||""))).length;
  const r=trades.map(t=>Number(t.R)).filter(Number.isFinite);
  return {sampleSize:trades.length,wins,losses,winRate:(wins+losses)?Number((wins/(wins+losses)*100).toFixed(1)):null,avgR:r.length?Number((r.reduce((a,b)=>a+b,0)/r.length).toFixed(2)):null,totalR:r.length?Number(r.reduce((a,b)=>a+b,0).toFixed(2)):null};
}
function compactLearning(entries=[]){return entries.slice(-20).map(x=>({timestamp:x.timestamp,type:x.type,content:String(x.content||"").slice(0,1800),meta:x.meta||{}}));}
async function askAI({task, trade, history=[]}) {
  if(!openai)return {ok:false,error:"OPENROUTER_API_KEY manquante. Le moteur JARVIS est prêt mais aucune clé serveur n'est configurée."};
  const profile=await loadProfile();
  const model=normalizeModel(trade?.model || (String(task||"").toUpperCase().includes("CRYPTO")?"CRYPTO":"NQ"));
  const contract=buildModelContract(model);
  const historicalContext=await loadHistoricalContext();
  const obsidianTrades=(await loadObsidianTrades()).filter(t=>t.model===model);
  const backtestTrades=obsidianTrades.filter(t=>t.type==="BACKTEST");
  const liveJournalTrades=obsidianTrades.filter(t=>t.type!=="BACKTEST");
  const learning=(await loadLearning()).entries.filter(x=>x.model===model);
  const scopedHistory=history.filter(t=>normalizeModel(t?.model||model)===model);
  const combined=[...scopedHistory,...liveJournalTrades];
  const images=Array.isArray(trade?.screenshots)?trade.screenshots.filter(x=>/^data:image\/(png|jpe?g|webp);base64,/i.test(String(x))).slice(0,2):[];
  const payload={engineVersion:AI_ENGINE_VERSION,traderProfile:profile,model,modelContract:contract,gradeScale:AI_GRADE_SCALE,historicalContext:historicalContext.models?.[model]||{},evidenceStats:evidenceStats(combined),task,currentTrade:trade?compactTradeForAI(trade):null,recentHistory:scopedHistory.slice(-60).map(compactTradeForAI),obsidian:{status:await loadObsidianStatus(),modelSampleSize:obsidianTrades.length},backtests:{sampleSize:backtestTrades.length,evidenceStats:evidenceStats(backtestTrades),recentRecords:backtestTrades.slice(-120).map(compactTradeForAI),liveJournalSampleSize:liveJournalTrades.length},learningMemory:compactLearning(learning)};
  const protocol=[
    "JARVIS LIVE-TRADING PROTOCOL",
    "- Analyze the setup as it exists NOW. Do not use hindsight.",
    "- The trade result is an outcome, not proof of setup quality. Never upgrade/downgrade because it won or lost.",
    "- The trader is learning. Grade A, B and borderline setups honestly; do not force A.",
    "- Be nuanced: one small imperfection should lower the grade without automatically invalidating the setup.",
    model==="NQ" ? "- Futures: explicitly judge entry timing EARLY / WELL-PLACED / LATE and retracement SHALLOW / ADEQUATE / DEEP / TOO DEEP when evidence permits." : "- Crypto: prioritize market direction, Key Open manipulation/sweep and aligned HTF POI. OTE/Fib is secondary.",
    "- FACTS must come from the screenshot/data. Unknown or unreadable = UNKNOWN.",
    "- Separate FACT, INTERPRETATION, HYPOTHESIS and TEST.",
    "- FINAL GRADE must use this scale: "+AI_GRADE_SCALE,
    "OUTPUT ORDER: LIVE READ -> MODEL CHECK -> ENTRY QUALITY -> RISK / R:R -> TIMING + NEWS -> MAIN ERROR / IMPERFECTION -> FINAL GRADE -> ONE NEXT ACTION",
    "- Never guarantee direction or outcome."
  ].join("\n");
  const userContent=images.length?[{type:"input_text",text:JSON.stringify({...payload,task:String(task||"")+"\n"+protocol,screenshotCount:images.length})},...images.map(x=>({type:"input_image",image_url:x,detail:"high"}))]:JSON.stringify({...payload,task:String(task||"")+"\n"+protocol,screenshotCount:0});
  try{
    const response=await openai.responses.create({model:MODEL,reasoning:{effort:"high"},input:[{role:"system",content:BASE_SYSTEM+"\n\nACTIVE MODEL CONTRACT:\n"+JSON.stringify(contract)+"\n\nGRADE SCALE:\n"+AI_GRADE_SCALE},{role:"user",content:userContent}]});
    return {ok:true,text:response.output_text,model:response.model||AI_PRIMARY_MODEL,provider:AI_PROVIDER,engineVersion:AI_ENGINE_VERSION};
  }catch(e){
    const status=Number(e?.status||e?.statusCode||0);
    const detail=String(e?.message||"");
    if(status===429&&/(free-models-per-day|free.*daily|daily.*free)/i.test(detail)) return {ok:false,error:"Quota du fournisseur IA atteinte. Gemini reste prioritaire; vérifie GEMINI_API_KEY ou les limites du fournisseur.",code:"AI_DAILY_QUOTA",model:MODEL,engineVersion:AI_ENGINE_VERSION};
    throw e;
  }
}

function normalizeModel(value) {
  return String(value || "NQ").toUpperCase() === "CRYPTO" ? "CRYPTO" : "NQ";
}

async function buildOptimizationSnapshot(model) {
  const all = await loadTrades();
  const trades = all.filter(t => t.model === model);
  const imported = (await loadObsidianTrades()).filter(t => t.model === model);
  const importedBacktests = imported.filter(t => t.type === "BACKTEST");
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
    importedBacktestSampleSize:importedBacktests.length,
    importedBacktestOutcomes:Object.entries(importedBacktests.reduce((a,t)=>{a[t.outcome]=(a[t.outcome]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]),
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
  return {model,snapshot,allTradesCount:trades.length,recentDetailedTrades:trades.slice(-200),obsidian:{status:await loadObsidianStatus(),tradeRecords:obsidianTrades.slice(-250),backtests:obsidianTrades.filter(t=>t.type==="BACKTEST").slice(-1000)}};
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

app.get("/api/ai/status",requirePrivateRequest,(req,res)=>res.json({
  ok:true,
  engine:"JARVIS",
  engineVersion:AI_ENGINE_VERSION,
  configured:!!openai,
  primaryModel:MODEL,
  fallbackModels:FALLBACK_MODELS,
  freeModelMode:/^openrouter\/free$/i.test(MODEL),
  storageRoot:EDGEFLOW_STORAGE_ROOT,
  storageMode:EDGEFLOW_STORAGE_ROOT.startsWith("/data")?"PERSISTENT_VOLUME_EXPECTED":"LOCAL_EPHEMERAL_UNLESS_VOLUME_ATTACHED"
}));

app.get("/api/history/ai-context",requirePrivateRequest,  async (req,res) => {
  const model=normalizeModel(req.query.model);
  const data=await buildAIHistory(model);
  res.json({model,sampleSize:data.allTradesCount,dateRange:data.snapshot.dateRange,historicalContext:(await loadHistoricalContext()).models?.[model]||{},snapshot:data.snapshot,obsidian:data.obsidian});
});

app.get("/api/optimization/daily",requirePrivateRequest,  async (req,res) => {
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

app.post("/api/coach/question",requirePrivateRequest,  async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"Aucun fournisseur IA configuré."});
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

app.post("/api/voice/turn",requirePrivateRequest, async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  if(!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ok:false,error:"ELEVENLABS_API_KEY manquante. Ajoute-la au backend pour activer la vraie voix JARVIS."});
  try{
    const audioBase64=String(req.body.audioBase64||"");
    const mimeType=String(req.body.mimeType||"audio/webm");
    if(!audioBase64) return res.status(400).json({ok:false,error:"Audio manquant."});
    const audioBuffer=Buffer.from(audioBase64,"base64");
    if(audioBuffer.length>12*1024*1024) return res.status(413).json({ok:false,error:"Audio trop volumineux."});
    const form=new FormData();
    form.append("file",new Blob([audioBuffer],{type:mimeType}),"voice.webm");
    form.append("model_id","scribe_v2");
    form.append("language_code","fra");
    const stt=await fetch("https://api.elevenlabs.io/v1/speech-to-text",{method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY},body:form});
    const sttData=await stt.json().catch(()=>({}));
    if(!stt.ok) return res.status(502).json({ok:false,error:sttData.detail||sttData.message||"ElevenLabs STT failed."});
    const transcript=String(sttData.text||"").trim();
    if(!transcript) return res.status(400).json({ok:false,error:"Aucune parole détectée."});
    const model=normalizeModel(req.body.model);
    const previousTurns=Array.isArray(req.body.previousTurns)?req.body.previousTurns.slice(-12):[];
    const reply=String(await askVoiceCoach({model,userText:transcript,previousTurns})||"").trim();
    const voiceId=process.env.ELEVENLABS_VOICE_ID||"JBFqnCBsd6RMkjVDRZzb";
    const ttsModel=process.env.ELEVENLABS_TTS_MODEL||"eleven_v4_turbo";
    const tts=await fetch("https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voiceId)+"?output_format=mp3_44100_128",{method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({text:reply,model_id:ttsModel,language_code:"fr",voice_settings:{stability:.62,similarity_boost:.78,style:.18,use_speaker_boost:true,speed:.94}})});
    if(!tts.ok) return res.status(502).json({ok:false,error:"ElevenLabs TTS failed: "+(await tts.text()).slice(0,500)});
    const audio=Buffer.from(await tts.arrayBuffer()).toString("base64");
    res.json({ok:true,model,transcript,reply,audioBase64:audio,voice:"JARVIS-style",ttsModel});
  }catch(e){res.status(502).json({ok:false,error:e.message});}
});

app.post("/api/detect-screen-trade",requirePrivateRequest, async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  try{
    const broker=String(req.body.broker||"").toUpperCase()==="KCEX"?"KCEX":"RITHMIC";
    const model=broker==="KCEX"?"CRYPTO":"NQ";
    const current=String(req.body.imageDataUrl||"");
    const previous=String(req.body.previousImageDataUrl||"");
    const valid=x=>/^data:image\/(png|jpe?g|webp);base64,/i.test(x);
    if(!valid(current)) return res.status(400).json({ok:false,error:"Capture courante invalide."});
    if(current.length>9000000||previous.length>9000000) return res.status(413).json({ok:false,error:"Capture trop volumineuse."});
    const previousInput=valid(previous)?[{type:"input_text",text:"IMAGE PRÉCÉDENTE — compare-la avec la capture actuelle pour détecter uniquement une nouvelle activité de trade."},{type:"input_image",image_url:previous,detail:"high"}]:[];
    const response=await openai.responses.create({
      model:MODEL,reasoning:{effort:"medium"},
      input:[
        {role:"system",content:BASE_SYSTEM+"\\nTRADE DETECTION MODE: You are a visual event detector for "+broker+". Return ONLY valid JSON with keys detected, confidence, instrument, direction, orderType, price, quantity, context. detected=true ONLY when the current screen contains credible visual evidence of a newly created/filled/changed trading order or position compared with the previous image. Ignore ordinary price movement, candles, DOM movement, P&L fluctuations, clocks, animations, and unrelated UI changes. If uncertain, detected=false. Never infer hidden account state."},
        {role:"user",content:[
          {type:"input_text",text:JSON.stringify({broker,model,task:"Compare current and previous screenshots. Detect a new user trading action only if visually supported. For Rithmic/Futures pay attention to a new order/fill/position. For KCEX/Crypto pay attention to a new order/fill/position. Do not call a chart candle movement a trade."})},
          ...previousInput,
          {type:"input_text",text:"IMAGE ACTUELLE — this is the authoritative current frame."},
          {type:"input_image",image_url:current,detail:"high"}
        ]}
      ]
    });
    const raw=String(response.output_text||"").trim().replace(/^```(?:json)?\\s*/i,"").replace(/\\s*```$/,"");
    let data;
    try{data=JSON.parse(raw)}catch{data={detected:false,confidence:0,instrument:"",direction:"",orderType:"",price:null,quantity:null,context:"Réponse visuelle non exploitable."};}
    const confidence=Number(data.confidence||0);
    const detected=data.detected===true&&confidence>=0.75;
    res.json({ok:true,broker,model,detected,confidence,instrument:String(data.instrument||""),direction:String(data.direction||""),orderType:String(data.orderType||""),price:data.price??null,quantity:data.quantity??null,context:String(data.context||"")});
  }catch(e){res.status(502).json({ok:false,error:e.message||"Détection impossible."});}
});

app.post("/api/analyze-screen",requirePrivateRequest,  async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  try{
    const model=normalizeModel(req.body.model);
    if(!["CRYPTO","NQ"].includes(model)) return res.status(400).json({ok:false,error:"Modèle d'observation invalide."});
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
        {role:"system",content:BASE_SYSTEM+"\nLIVE SCREEN OBSERVATION MODE: Analyze only what is actually visible in the supplied trading-platform screen capture. Do not invent prices, positions, orders, liquidity, or market structure that cannot be read. Separate visible facts from interpretation and hypothesis. For CRYPTO use: market direction -> manipulated/swept Key Open -> aligned HTF POI -> entry -> high RR. For NQ/Futures use: HTF bias -> POI -> liquidity/manipulation -> Fibonacci retracement -> Rejection Block -> limit entry. This is read-only observation; never instruct automatic execution."},
        {role:"user",content:[
          {type:"input_text",text:JSON.stringify({
            model,
            context,
            historicalContext:historicalContext.models?.[model]||{},
            optimizationSnapshot:snapshot,
            task:"Inspect this current trading-platform screen. Extract visible instrument, direction/position if shown, entry/mark/P&L/leverage if shown, visible chart structure, and any immediately visible market context. Then relate only the visible evidence to the correct model: for Crypto use market direction -> manipulated Key Open/sweep -> aligned HTF POI -> entry -> high RR; for Futures use HTF bias -> POI -> liquidity/manipulation -> Fibonacci retracement -> Rejection Block -> limit entry. Clearly list missing information and do not infer hidden account state."
          })},
          {type:"input_image",image_url:imageDataUrl,detail:"high"}
        ]}
      ]
    });
    res.json({ok:true,model,text:response.output_text});
  }catch(e){res.status(502).json({ok:false,error:e.message});}
});


app.get("/api/connections/status",requirePrivateRequest, (req,res) => {
  const tv=tradovateStatus();
  const rithmicConfigured=Boolean(process.env.RITHMIC_USER&&process.env.RITHMIC_PASSWORD&&process.env.RITHMIC_SYSTEM);
  res.json({
    readOnly:true,
    tradovate:tv,
    rithmic:{configured:rithmicConfigured,connected:false,system:process.env.RITHMIC_SYSTEM||null,transport:"R|Protocol / WebSocket + Protobuf"},
    kcex:{available:true,mode:"screen-observer",apiDirect:false}
  });
});

app.get("/api/tradovate/status",requirePrivateRequest, (req,res)=>res.json(tradovateStatus()));
app.get("/api/tradovate/events",requirePrivateRequest, (req,res)=>res.json(liveEvents.slice(-100)));
app.get("/api/tradovate/snapshot",requirePrivateRequest, (req,res)=>res.json(tradovateStatus()));
app.post("/api/tradovate/connect",requirePrivateRequest, async(req,res)=>{try{await connectTradovate();res.json(tradovateStatus())}catch(e){res.status(502).json({ok:false,error:e.message,status:tradovateStatus()})}});
app.post("/api/tradovate/renew",requirePrivateRequest, async(req,res)=>{try{await renewTradovate();res.json(tradovateStatus())}catch(e){res.status(502).json({ok:false,error:e.message})}});

app.get("/api/learning",requirePrivateRequest,  async (req,res) => {
  const model=normalizeModel(req.query.model);
  const data=await loadLearning();
  res.json({model,entries:data.entries.filter(x=>x.model===model).slice(-100)});
});
app.get("/api/obsidian/status",requirePrivateRequest,  async (req,res) => {
  const status=await loadObsidianStatus();
  const trades=await loadObsidianTrades();
  const model=normalizeModel(req.query.model);
  const scoped=trades.filter(t=>t.model===model);
  res.json({...status,model,modelTradeRecords:scoped.length,imageAnalyses:scoped.reduce((n,t)=>n+(t.imageAnalyses?.length||0),0),job:obsidianJob});
});
app.post("/api/obsidian/import",requirePrivateRequest,  upload.single("file"), async (req,res) => {
  if(!req.file) return res.status(400).json({ok:false,error:"ZIP Obsidian manquant."});
  try {
    const status=await importObsidianZip(req.file.buffer);
    res.json({ok:true,status});
  } catch(e) {
    res.status(400).json({ok:false,error:e.message});
  }
});
app.post("/api/obsidian/analyze-images",requirePrivateRequest,  async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  const status=await loadObsidianStatus();
  if(!status.imported) return res.status(400).json({ok:false,error:"Import Obsidian requis avant l'analyse visuelle."});
  const saved=await loadObsidianJob();
  if(obsidianJob.running) return res.json({ok:true,started:false,resumed:false,job:obsidianJob});
  if(saved?.phase==="paused-rate-limit" || saved?.phase==="paused-context-limit" || saved?.phase==="paused" || saved?.phase==="error"){
    obsidianJob={...saved,running:false};
  }
  obsidianImageAnalysisLoop().catch(()=>{});
  res.json({ok:true,started:true,resumed:Boolean(saved?.processed),job:obsidianJob});
});
app.get("/api/obsidian/job",requirePrivateRequest,  async (req,res)=>{
  const saved=await loadObsidianJob();
  res.json(saved||obsidianJob);
});

app.get("/health", (req,res) => res.json({
  ok:true,
  service:"trading-assistant-bot",
  mode:"READ_ONLY",
  ai:!!openai,
  model:MODEL,
  multimodalTradeAnalysis:true,
  timestamp:new Date().toISOString()
}));

app.get("/api/profile",requirePrivateRequest,  async (req,res) => { res.json(await loadProfile()); });

app.get("/api/trades",requirePrivateRequest,  async (req,res) => {
  const trades=await loadTrades();
  const model=req.query.model;
  res.json(model ? trades.filter(t=>t.model===model) : trades);
});

app.post("/api/trades",requirePrivateRequest, async (req,res) => {
  const trades=await loadTrades();
  const trade=cleanTrade(req.body);
  trades.push(trade);
  await saveTrades(trades);
  res.status(201).json(trade);
});

app.post("/api/analyze-trade",requirePrivateRequest, async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  try{
    const trades=await loadTrades();
    const trade=cleanTrade(req.body.trade || req.body);
    trade.model=normalizeModel(trade.model);
    if(Array.isArray(trade.screenshots)){
      const images=trade.screenshots.filter(x=>/^data:image\/(png|jpe?g|webp);base64,/i.test(String(x))).slice(0,2);
      const totalBytes=images.reduce((n,x)=>n+Math.floor(String(x).length*.75),0);
      if(totalBytes>10*1024*1024) return res.status(413).json({ok:false,error:"Screenshots trop volumineux. Utilise 2 images compressées maximum."});
      trade.screenshots=images;
    }else trade.screenshots=[];
    const modelTask=trade.model==="CRYPTO"
      ? "Analyse ce setup avec le modèle CRYPTO uniquement : direction du marché → Key Open manipulé/sweep → POI HTF aligné → entrée → laisser jouer en high RR. OTE/Fib est secondaire."
      : "Analyse ce setup avec le modèle FUTURES/NQ uniquement : HTF bias → POI → liquidity/manipulation → Fibonacci retracement → Rejection Block → limit entry. Vérifie FVG/OB/PD array, sweep, MSS/CHOCH/BOS, displacement, retracement, session, R:R, news et exécution.";
    const result=await askAI({
      task:modelTask+" Fournis une analyse complète et factuelle du trade actuel. Sépare ce qui est visible/documenté de ce qui est inféré. Le score de checklist ne remplace jamais l'analyse du graphique. Ne conclus pas à partir du résultat du trade : analyse le setup tel qu'il est présenté.",
      trade,
      history:trades.filter(t=>t.model===trade.model)
    });
    if(!result.ok){
      const status=result.code==="AI_DAILY_QUOTA"?429:503;
      return res.status(status).json(result);
    }
    res.json({...result,model:trade.model,screenshotCount:trade.screenshots.length});
  }catch(e){
    const status=Number(e?.status||e?.statusCode||0);
    res.status(status>=400&&status<600?status:502).json({ok:false,error:e.message||"Analyse impossible."});
  }
});

app.post("/api/chat",requirePrivateRequest,  async (req,res) => {
  if(!openai) return res.status(503).json({ok:false,error:"OPENROUTER_API_KEY manquante."});
  const message=String(req.body.message||"").trim();
  if(!message) return res.status(400).json({ok:false,error:"Message vide."});
  if(message.length>12000) return res.status(413).json({ok:false,error:"Message trop long."});
  const trades=await loadTrades();
  const model=String(req.body.model||"NQ").toUpperCase()==="CRYPTO"?"CRYPTO":"NQ";
  const result=await askAI({
    task:`Answer the trader's question using ONLY the ${model} model and its stored trading history. Never import rules or trades from the other model. User question: ${String(req.body.message || "")}`,
    trade:null,
    history:trades.filter(t=>t.model===model)
  });
  if(!result.ok) return res.status(result.code==="AI_DAILY_QUOTA"?429:503).json(result);
  res.json(result);
});

app.get("/api/patterns",requirePrivateRequest,  async (req,res) => {
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
  if(!result.ok) return res.status(result.code==="AI_DAILY_QUOTA"?429:503).json(result);
  res.json({...result,deterministicStats:stats.slice(0,100)});
});

app.listen(PORT,()=>{console.log(`Trading Assistant backend listening on :${PORT}`); if(process.env.TRADOVATE_USERNAME&&process.env.TRADOVATE_PASSWORD&&process.env.TRADOVATE_APP_ID&&process.env.TRADOVATE_CID&&process.env.TRADOVATE_SEC){connectTradovate().catch(e=>emitLive({type:"startup_connect_error",error:e.message}));}});
