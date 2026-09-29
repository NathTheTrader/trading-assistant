import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";

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
