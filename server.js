import http from "node:http";
import OpenAI from "openai";

const PORT=Number(process.env.PORT||3000);
const MODEL=process.env.OPENAI_VISION_MODEL||"gpt-5.6-luna";
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||"*";

const json=(res,status,data)=>{
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"});
  res.end(JSON.stringify(data));
};

const prompt=`You are EDGEFLOW JARVIS, a trading journal vision assistant.
Analyze the supplied trading screenshot carefully. Extract ONLY information that is visible or strongly supported by the image. Never invent prices, RR, setup, session or P&L. If a value is not visible, return null.
The user's model uses retracements, Rejection Blocks, FVG, liquidity sweeps, MSS/CHOCH/BOS and Fibonacci 0.50, 0.62, 0.705 and 0.79. Use these terms only when the screenshot supports them.
Return ONLY valid JSON with this exact shape:
{"symbol":string|null,"side":"Long"|"Short"|null,"entry":string|null,"exit":string|null,"qty":string|null,"pnl":number|null,"rr":string|null,"setup":string|null,"grade":"A+"|"A"|"A-"|"B+"|"B"|"B-"|"C+"|"C"|null,"session":"London"|"Asia"|"NY AM"|"NY PM"|null,"note":string,"confidence":number}
The note should be concise and factual. Confidence is 0-100. If the screenshot is not a trading screenshot, set all extracted fields null and explain that in note.`;

async function readBody(req){
  let body=""; for await(const chunk of req) body+=chunk;
  if(body.length>14_000_000) throw new Error("Image payload too large.");
  return JSON.parse(body||"{}");
}

const server=http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS"){res.writeHead(204,{"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"});return res.end();}
  if(req.method==="GET" && req.url==="/health") return json(res,200,{ok:true,service:"edgeflow-jarvis",vision:true,model:MODEL});
  if(req.method!=="POST" || req.url!=="/v1/jarvis/analyze") return json(res,404,{error:"Not found"});
  try{
    if(!process.env.OPENAI_API_KEY) return json(res,503,{error:"OPENAI_API_KEY is not configured on the Jarvis server."});
    const body=await readBody(req);
    if(typeof body.image!=="string" || !body.image.startsWith("data:image/")) return json(res,400,{error:"A base64 data-image is required."});
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await client.responses.create({
      model:MODEL,
      input:[{role:"user",content:[{type:"input_text",text:prompt},{type:"input_image",image_url:body.image,detail:"high"}]}],
      max_output_tokens:700
    });
    const raw=response.output_text||"";
    let result;
    try{result=JSON.parse(raw.replace(/^\`\`\`json\s*/,"").replace(/\s*\`\`\`$/,"").trim())}
    catch{ return json(res,502,{error:"Jarvis returned an invalid structured result.",raw:raw.slice(0,2000)}); }
    return json(res,200,{ok:true,result});
  }catch(e){
    console.error(e);
    return json(res,500,{error:e?.message||"Jarvis analysis failed."});
  }
});
server.listen(PORT,()=>console.log("EdgeFlow Jarvis API listening on "+PORT));
