// api/ai.js — chat-style API with `mode=discover` for up-to-4 follow-up questions

async function readJson(req) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
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
    let mode = url.searchParams.get("mode") || ""; // "", "discover"
    let model = "gpt-4o-mini"; // default fast, good reasoning
    let prompt_id = null;      // optional (kept for future SDK use)

    if (req.method === "POST") {
      const body = await readJson(req);

      // Prefer messages[] if provided
      if (Array.isArray(body?.messages)) messages = body.messages;
      else prompt = (body?.prompt || "").trim() || prompt;

      if (typeof body?.mode === "string") mode = body.mode.trim();
      if (typeof body?.model === "string" && body.model.trim()) model = body.model.trim();
      if (typeof body?.prompt_id === "string" && body.prompt_id.trim()) prompt_id = body.prompt_id.trim();
    }

    // Guard
    if (!messages.length && !prompt) {
      return res.status(400).json({ error: "No prompt or messages" });
    }

    // System briefs
    const SYSTEM_BRIEF = `
You are **Chiltern Trades Assistant** — an intake assistant for UK plumbing & electrical jobs.
Tone: warm, efficient, reassuring. Keep replies short (≤120 words).

Do:
- Quickly understand the issue (what/where/severity) and ask focused follow-ups.
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
`.trim();

    const DISCOVER_BRIEF = `
You are a friendly UK trade-intake assistant. The user describes a plumbing or electrical issue.
Return **up to 4 short follow-up questions** (max **15 words** each) that best clarify the problem before collecting contact details.
**Format strictly as a numbered list**:
1) ...
2) ...
3) ...
4) ...
No advice, no answers, no extra lines, no summaries — questions only.
`.trim();

    // Build messages for OpenAI
    let chatMessages;

    if (mode === "discover") {
      // First turn: generate up to 4 short follow-up questions, numbered
      chatMessages = [
        { role: "system", content: DISCOVER_BRIEF },
        { role: "user", content: prompt || (messages[0]?.content || "") },
      ];
    } else if (messages.length) {
      // Normal chat mode: prepend our system brief and forward the rest
      chatMessages = [{ role: "system", content: SYSTEM_BRIEF }, ...messages];
    } else {
      // Single-prompt chat mode
      chatMessages = [
        { role: "system", content: SYSTEM_BRIEF },
        { role: "user", content: prompt },
      ];
    }

    // Call OpenAI (Chat Completions)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: mode === "discover" ? 0.3 : 0.5, // keep questions crisp
        messages: chatMessages,
        // Note: REST doesn't accept a prompt preset id; we keep prompt_id only for compatibility.
        // prompt_id: prompt_id, // (ignored by REST API)
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
