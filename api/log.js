// api/log.js — forwards chat data to your Google Sheet (via Apps Script)

async function readJson(req) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const body = await readJson(req);

    // 🔗 Your Google Apps Script Web App URL
    const SHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbx40gwb39muKIf9F_kFErk2vkark9jKbhYRmmsJdLt95wakx4Wtd3CuBwXbJfz5epbIEQ/exec";

    const g = await fetch(SHEET_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await g.text();
    return res.status(200).json({ ok: true, sheetResponse: text });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
};
