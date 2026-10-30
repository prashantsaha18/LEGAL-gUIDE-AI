// LegalGuide AI - tiny local server (no npm packages needed, Node 18+).
// Serves the website and sends chat questions to the Groq API.

const http = require("http");
const fs = require("fs");
const path = require("path");

/* ---------- read .env ---------- */
try {
  const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch { /* no .env file yet */ }

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are LegalGuide AI, a plain-language legal information assistant for people in India.

How to answer:
- Start with a short, direct answer, then explain the relevant law, the practical steps, and the documents or evidence the person should keep.
- Use current Indian law. The Bharatiya Nyaya Sanhita (BNS), Bharatiya Nagarik Suraksha Sanhita (BNSS) and Bharatiya Sakshya Adhiniyam (BSA) replaced the IPC, CrPC and Indian Evidence Act from 1 July 2024; mention the older name when it helps. Other common laws: Consumer Protection Act 2019, Transfer of Property Act, Indian Contract Act, Industrial Relations/Labour Codes, Hindu Marriage Act, Special Marriage Act, RERA, state rent control acts.
- Only cite a section or case when you are confident it is correct. If unsure, say so instead of guessing. State that state-level rules can differ.
- Ask one short clarifying question when a key fact (state, dates, amount, written agreement) would change the answer, but still give useful general guidance first.
- Explain where to go: police station, consumer commission, labour commissioner, civil court, RERA authority, or a lawyer. Mention free legal aid through the District Legal Services Authority (NALSA helpline 15100) when money is a barrier.
- Never promise an outcome. Do not help plan fraud, evasion of lawful process, harassment, or violence.
- If someone is in immediate danger, tell them to call 112.
- Reply in the language the user writes in (English, Hindi, Marathi, etc.).
- Keep answers organised with short headings and bullet points, and end with one line reminding the user that this is general information and a licensed advocate should review their documents for high-stakes matters.`;

const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/script.js": ["script.js", "application/javascript; charset=utf-8"],
};

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 100000) { reject(new Error("Too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function handleChat(req, res) {
  if (!API_KEY || !API_KEY.startsWith("gsk_")) {
    return sendJson(res, 500, { error: "Add your Groq key to the .env file as GROQ_API_KEY=gsk_... and restart the server." });
  }

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "Invalid request." }); }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return sendJson(res, 400, { error: "Send a question to get started." });
  }

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const detail = (data.error && data.error.message) || `status ${upstream.status}`;
      console.error("Groq error:", detail);
      const hint = upstream.status === 401
        ? "Groq rejected the API key. Check GROQ_API_KEY in .env."
        : `Groq could not answer: ${detail}`;
      return sendJson(res, 502, { error: hint });
    }

    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) return sendJson(res, 502, { error: "Groq returned an empty answer. Please try again." });
    sendJson(res, 200, { reply: reply.trim() });
  } catch (err) {
    console.error("Request failed:", err.message);
    sendJson(res, 500, { error: "Could not reach Groq. Check your internet connection." });
  }
}

http
  .createServer((req, res) => {
    const url = req.url.split("?")[0];

    if (url === "/api/chat") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
      return handleChat(req, res);
    }

    const file = FILES[url];
    if (!file) { res.writeHead(404); return res.end("Not found"); }
    fs.readFile(path.join(__dirname, file[0]), (err, content) => {
      if (err) { res.writeHead(500); return res.end("Could not read file"); }
      res.writeHead(200, { "Content-Type": file[1] });
      res.end(content);
    });
  })
  .listen(PORT, () => {
    console.log(`LegalGuide AI running at http://localhost:${PORT}`);
    if (!API_KEY) console.log("Note: GROQ_API_KEY is not set yet. Create a .env file (see .env.example).");
  });
