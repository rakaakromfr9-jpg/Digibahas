import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const app=express();
const PORT=Number(process.env.PORT||3000);
const JWT_SECRET=process.env.JWT_SECRET||"dev-only-change-this-secret";
const db=new Database(path.join(__dirname,"digibahas.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS journals(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS conversations(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 messages_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

app.use(express.json({limit:"1mb"}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,"public")));

function signUser(user){
  return jwt.sign({sub:user.id},JWT_SECRET,{expiresIn:"7d"});
}
function setSession(res,user){
  res.cookie("digibahas_session",signUser(user),{
    httpOnly:true,
    sameSite:"lax",
    secure:process.env.NODE_ENV==="production",
    maxAge:7*24*60*60*1000
  });
}
function auth(req,res,next){
  try{
    const token=req.cookies.digibahas_session;
    if(!token) return res.status(401).json({error:"Silakan masuk terlebih dahulu."});
    const payload=jwt.verify(token,JWT_SECRET);
    const user=db.prepare("SELECT id,name,email FROM users WHERE id=?").get(payload.sub);
    if(!user) return res.status(401).json({error:"Sesi tidak valid."});
    req.user=user; next();
  }catch{res.status(401).json({error:"Sesi tidak valid atau sudah kedaluwarsa."});}
}
function publicUser(u){return {id:u.id,name:u.name,email:u.email};}

app.post("/api/auth/register",async(req,res)=>{
  const {name,email,password}=req.body||{};
  if(!name||!email||!password) return res.status(400).json({error:"Nama, email, dan kata sandi wajib diisi."});
  if(password.length<8) return res.status(400).json({error:"Kata sandi minimal 8 karakter."});
  const normalized=email.trim().toLowerCase();
  try{
    const hash=await bcrypt.hash(password,12);
    const info=db.prepare("INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)")
      .run(name.trim(),normalized,hash,Date.now());
    const user=db.prepare("SELECT id,name,email FROM users WHERE id=?").get(info.lastInsertRowid);
    setSession(res,user);res.json({user:publicUser(user)});
  }catch(e){
    if(String(e.message).includes("UNIQUE")) return res.status(409).json({error:"Email sudah terdaftar."});
    res.status(500).json({error:"Gagal membuat akun."});
  }
});
app.post("/api/auth/login",async(req,res)=>{
  const {email,password}=req.body||{};
  const user=db.prepare("SELECT * FROM users WHERE email=?").get(String(email||"").trim().toLowerCase());
  if(!user||!(await bcrypt.compare(String(password||""),user.password_hash)))
    return res.status(401).json({error:"Email atau kata sandi salah."});
  setSession(res,user);res.json({user:publicUser(user)});
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("digibahas_session");res.json({ok:true});});
app.get("/api/auth/me",(req,res)=>{
  try{
    const token=req.cookies.digibahas_session;if(!token) return res.status(401).end();
    const p=jwt.verify(token,JWT_SECRET);
    const user=db.prepare("SELECT id,name,email FROM users WHERE id=?").get(p.sub);
    if(!user)return res.status(401).end();res.json({user:publicUser(user)});
  }catch{res.status(401).end();}
});

/* Journals */
app.get("/api/journals",auth,(req,res)=>{
  const journals=db.prepare("SELECT id,title,body,created_at FROM journals WHERE user_id=? ORDER BY id DESC").all(req.user.id)
    .map(x=>({...x,date:new Date(x.created_at).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}));
  res.json({journals});
});
app.post("/api/journals",auth,(req,res)=>{
  const {title,body}=req.body||{};
  if(!title||!body)return res.status(400).json({error:"Judul dan isi wajib diisi."});
  const info=db.prepare("INSERT INTO journals(user_id,title,body,created_at) VALUES(?,?,?,?)")
    .run(req.user.id,String(title).trim(),String(body).trim(),Date.now());
  res.json({id:Number(info.lastInsertRowid)});
});
app.delete("/api/journals/:id",auth,(req,res)=>{
  db.prepare("DELETE FROM journals WHERE id=? AND user_id=?").run(req.params.id,req.user.id);
  res.json({ok:true});
});

/* Conversations */
app.get("/api/conversations",auth,(req,res)=>{
  const rows=db.prepare("SELECT id,title,updated_at FROM conversations WHERE user_id=? ORDER BY updated_at DESC").all(req.user.id);
  res.json({conversations:rows.map(x=>({id:x.id,title:x.title,updated:x.updated_at}))});
});
app.get("/api/conversations/:id",auth,(req,res)=>{
  const row=db.prepare("SELECT * FROM conversations WHERE id=? AND user_id=?").get(req.params.id,req.user.id);
  if(!row)return res.status(404).json({error:"Percakapan tidak ditemukan."});
  res.json({conversation:{id:row.id,title:row.title,messages:JSON.parse(row.messages_json),updated:row.updated_at}});
});

/* AI */
const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

app.post("/api/chat", auth, async (req, res) => {
  if (!gemini) {
    return res.status(503).json({
      error: "GEMINI_API_KEY belum diisi di file .env."
    });
  }

  const { messages, systemPrompt } = req.body || {};

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({
      error: "Pesan tidak valid."
    });
  }

  try {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: String(m.text || "")
        }
      ]
    }));

    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction:
          String(systemPrompt || "Jawab dalam Bahasa Indonesia."),
        maxOutputTokens: 1200
      }
    });

    const text =
      String(response.text || "").trim() ||
      "Maaf, AI tidak menghasilkan jawaban.";

    let convId = req.body.conversationId;
    const oldMessages = messages;

    if (convId) {
      const existing = db
        .prepare(
          "SELECT id FROM conversations WHERE id=? AND user_id=?"
        )
        .get(convId, req.user.id);

      if (!existing) {
        convId = null;
      }
    }

    if (!convId) {
      const title = String(
        messages.find((m) => m.role === "user")?.text ||
        "Percakapan Baru"
      ).slice(0, 60);

      const info = db
        .prepare(
          `INSERT INTO conversations
          (user_id,title,messages_json,updated_at)
          VALUES(?,?,?,?)`
        )
        .run(
          req.user.id,
          title,
          JSON.stringify([
            ...oldMessages,
            {
              role: "assistant",
              text
            }
          ]),
          Date.now()
        );

      convId = Number(info.lastInsertRowid);
    } else {
      const next = [
        ...oldMessages,
        {
          role: "assistant",
          text
        }
      ];

      db.prepare(
        `UPDATE conversations
         SET messages_json=?, updated_at=?
         WHERE id=? AND user_id=?`
      ).run(
        JSON.stringify(next),
        Date.now(),
        convId,
        req.user.id
      );
    }

    res.json({
      text,
      conversationId: convId
    });

  } catch (e) {
    console.error("Gemini error:", e);

    res.status(500).json({
      error: "Gemini gagal memproses permintaan."
    });
  }
});
  
/* KBBI
   Default behavior intentionally avoids copying the official dictionary into this app.
   Configure KBBI_API_BASE/KBBI_API_KEY only when you have a permitted data/API source.
*/
app.get("/api/kbbi/search",async(req,res)=>{
  const q=String(req.query.q||"").trim();
  if(!q)return res.status(400).json({error:"Kata wajib diisi."});
  const officialUrl=`https://kbbi.kemdikbud.go.id/entri/${encodeURIComponent(q)}`;
  const base=String(process.env.KBBI_API_BASE||"").replace(/\/$/,"");
  if(!base)return res.json({entries:[],sourceUrl:officialUrl,officialUrl});
  try{
    const headers={Accept:"application/json"};
    if(process.env.KBBI_API_KEY)headers["x-api-key"]=process.env.KBBI_API_KEY;
    const url=base.includes("{word}")?base.replace("{word}",encodeURIComponent(q)):base+"/"+encodeURIComponent(q);
    const r=await fetch(url,{headers});
    if(!r.ok)throw new Error("KBBI provider error");
    const raw=await r.json();
    const entries=normalizeKbbi(raw,q);
    res.json({entries,sourceUrl:officialUrl,officialUrl});
  }catch(e){
    res.json({entries:[],sourceUrl:officialUrl,officialUrl});
  }
});
function normalizeKbbi(raw,q){
  const out=[];
  if(Array.isArray(raw))raw.forEach(x=>out.push({lemma:x.lemma||x.word||q,definition:x.definition||x.arti||""}));
  if(raw?.entries?.length)raw.entries.forEach(e=>{
    const defs=e.definitions||[];
    defs.forEach(d=>out.push({lemma:raw.lemma||e.entry||q,definition:d.definition||d.arti||""}));
  });
  if(raw?.data?.length)raw.data.forEach(x=>out.push({lemma:x.lemma||x.word||q,definition:x.definition||x.arti||""}));
  if(raw?.data && !Array.isArray(raw.data))out.push({lemma:raw.data.lemma||q,definition:raw.data.definition||raw.data.arti||""});
  return out.filter(x=>x.definition).slice(0,20);
}

app.get(/.*/,(req,res)=>{
  if(req.path.startsWith("/api/"))return res.status(404).json({error:"Endpoint tidak ditemukan."});
  res.sendFile(path.join(__dirname,"public","digibahas.html"));
});
app.listen(PORT,()=>console.log(`DIGIBAHAS berjalan di http://localhost:${PORT}`));
