// Works natively on Vercel (Node 18+ has fetch built-in)

module.exports = async (req, res) => {
  try {
    // Get the prompt text from the POST request
    const prompt =
      req.method === "POST" ? (req.body?.prompt || "").trim() : "";

    if (!prompt) {
      return res.status(400).json({ error: "No prompt" });
    }

    // Send request to OpenAI
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
      }),
    });

    // Handle any API errors
    if (!r.ok) {
      const text = await r.text();
      return res
        .status(500)
        .json({ error: "OpenAI error", detail: text });
    }

    // Extract and return the AI's reply
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ reply });
  } catch (e) {
    // Handle unexpected server errors
    return res
      .status(500)
      .json({ e
