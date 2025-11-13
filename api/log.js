// api/log.js — forwards chat data (including images[]) to Google Apps Script

async function readJson(req) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  if (!APPS_SCRIPT_URL) return res.status(500).json({ error: "Missing APPS_SCRIPT_URL env var" });

  try {
    const body = await readJson(req);

    const g = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await g.text();
    res.setHeader("Content-Type", "application/json");
    return res.status(g.ok ? 200 : 502).send(text);
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
};
