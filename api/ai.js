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

    // Inputs we support
    let prompt = url.searchParams.get("prompt") || "";
    let messages = [];
    let model = "gpt-5-mini"; // default
    let prompt_id = null;     // optional, not strictly required

    if (req.method === "POST") {
      const body = await readJson(req);
      if (Array.isArray(body?.messages)) messages = body.messages;
      else prompt = (body?.prompt || "").trim() || prompt;

      if (typeof body?.model === "string" && body.model.trim()) model = body.model.trim();
      if (typeof body?.prompt_id === "string" && body.prompt_id.trim()) prompt_id = body.prompt_id.trim();
    }

    if (!messages.length && !prompt) {
      return res.status(400).json({ error: "No prompt or messages" });
    }

    // Strong system brief (inline so it works immediately)
    const SYSTEM_BRIEF = `
You are **Chiltern Trades Assistant** — an intake assistant for UK plumbing & electrical jobs.
Tone: warm, efficient, reassuring. Keep replies short (≤120 words).

Do:
- Quickly understand the issue (what/where/severity); ask focused follow-ups (max ~4 at a time).
- Encourage photos if useful.
- Collect: first name, postcode area (e.g., HP5), phone number, preferred call time (today pm / tomorrow am / this week), optional budget, and consent to share details with a verified local professional.
- Provide a concise recap before final confirmation.

Safety:
- No repair/wiring instructions or DIY steps with tools or live services.
- If gas smell/CO alarm/water on electrics/burning smell/sparking is mentioned:
  * Advise immediate safety (ventilate, keep clear, switch off if safe).
  * Gas emergency: **0800 111 999**.
  * Continue intake calmly.

Never:
- Promise prices or availability. Ballparks only if explicitly asked (and mark as estimate).
- Ask for full street address — postcode area is enough for intake.
`;

    // Build messages:
    // - If messages[] is supplied, we ALWAYS prepend our system brief
    // - Else we wrap the single prompt with system + user
    const chatMessages = messages.length
      ? [{ role: "system", content: SYSTEM_BRIEF }, ...messages]
      : [
          { role: "system", content: SYSTEM_BRIEF },
          { role: "user", content: prompt },
        ];

    // Call OpenAI Chat Completions API
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        // Optional: you provided a Prompt ID:
        // "pmpt_68fa4bc64dd88193b379fa1801182e9b0f7c4f8f73a8009e"
        // Some SDKs support preset prompts; the REST endpoint does not take a "prompt" object here.
        // We still accept prompt_id in the request so you can use it later if you switch SDKs.
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
