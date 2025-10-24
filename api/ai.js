// Minimal, works natively on Vercel (Node 18+ has fetch built-in)

module.exports = async (req, res) => {
  try {
    // Read the prompt text if the request is POST
    const prompt = req.method === "POST" ? (req.body?.prompt || "").trim() : "";
    if (!prompt) {
      return res.status(400).json({ error: "No prompt" });
    }

    // Send the prompt to OpenAI
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "You triage local trades enquiries. Be concise and helpful.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    // Handle response errors
    if (!r.ok) {
      const text = await r.text();
      return res
        .status(500)
        .json({ error: "OpenAI error", detail: text });
    }

    // Parse and return OpenAI's reply
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ reply });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Server error", detail: String(e) });
  }
};
