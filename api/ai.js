// api/ai.js — Vercel Node Serverless with CORS + body parsing + GET ?prompt=...
async function readJson(req) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  // --- CORS ---
  const origin = req.headers.origin || "*"; // you can hardcode your domain later
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  // ------------

  try {
    // Support GET ?prompt=... for quick tests
    const url = new URL(req.url, `https://${req.headers.host}`);
    let prompt = url.searchParams.get("prompt") || "";

    // Parse JSON on POST
    if (req.method === "POST") {
      const body = await readJson(req);
      prompt = (body?.prompt || "").trim() || prompt;
    }

    if (!prompt) return res.status(400).json({ error: "No prompt" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "You triage local trades enquiries. Ask 3–5 focused questions max. Keep replies ≤120 words. Capture name, contact, postcode, budget, dates when relevant." },
          { role: "user", content: prompt },
        ],
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

