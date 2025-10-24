// api/ai.js — chat-style API (supports messages[] or prompt), CORS, body parsing, GET test

async function readJson(req) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    let prompt = url.searchParams.get("prompt") || "";
    let messages = [];

    if (req.method === "POST") {
      const body = await readJson(req);
      if (Array.isArray(body?.messages)) messages = body.messages;
      else prompt = (body?.prompt || "").trim() || prompt;
    }

    if (!messages.length && !prompt) {
      return res.status(400).json({ error: "No prompt or messages" });
    }

    // Build messages: prefer messages[], else wrap prompt
    const chatMessages = messages.length
      ? messages
      : [
          { role: "system", content: "You triage local trades enquiries. Ask 3–5 focused questions max. Keep replies ≤120 words. Capture name, contact, postcode, budget, dates when relevant." },
          { role: "user", content: prompt },
        ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: chatMessages,
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: "OpenAI error", detail: text });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
};


