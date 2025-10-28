// /api/log.js — uploads images to Drive and appends to Sheets (no Apps Script)
const { google } = require("googleapis");

async function readJson(req) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// Allow larger payloads for base64 images
module.exports.config = {
  api: { bodyParser: { sizeLimit: "12mb" } }
};

module.exports = async (req, res) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    // --- env
    const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
    const GOOGLE_SA_KEY = (process.env.GOOGLE_SA_KEY || "").replace(/\\n/g, "\n");
    const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || "1BKKc1gafV-l8_EmZ25xUrx3srZKHrzpN";
    const SHEET_ID = process.env.SHEET_ID || "1tiScof0oju3BslbkzvN_iKCPhhaU7kyQotFNr2BqF6g";
    const SHEET_TAB = process.env.SHEET_TAB || "Leads";

    if (!GOOGLE_SA_EMAIL || !GOOGLE_SA_KEY) {
      return res.status(500).json({ error: "Missing Google service account envs" });
    }

    const body = await readJson(req);
    const {
      name = "",
      contact = "",
      postcode = "",
      enquiry = "",
      summary = "",
      images = [] // [{ name, mime, data(base64 no prefix) }]
    } = body || {};

    // --- auth
    const jwt = new google.auth.JWT({
      email: GOOGLE_SA_EMAIL,
      key: GOOGLE_SA_KEY,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    await jwt.authorize();

    const drive = google.drive({ version: "v3", auth: jwt });
    const sheets = google.sheets({ version: "v4", auth: jwt });

    // --- upload images (max 3)
    const links = [];
    for (const img of (images || []).slice(0, 3)) {
      if (!img?.data) continue;
      const buf = Buffer.from(img.data, "base64");
      const mime = img.mime || "image/jpeg";
      const fileName = sanitizeName(`${Date.now()}_${(img.name || "photo.jpg")}`);

      const created = await drive.files.create({
        requestBody: { name: fileName, parents: [DRIVE_FOLDER_ID], mimeType: mime },
        media: { mimeType: mime, body: bufferToStream(buf) },
        fields: "id"
      });

      const fileId = created.data.id;

      // make link-viewable
      await drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" }
      });

      const meta = await drive.files.get({ fileId, fields: "webViewLink, webContentLink" });
      links.push(meta.data.webViewLink || meta.data.webContentLink);
    }

    // build a single cell with multiple HYPERLINKs separated by line breaks
    const hyperlinkFormula = links.length
      ? "=" + links.map((u, i) => `HYPERLINK("${u}","Photo ${i + 1}")`).join(" & CHAR(10) & ")
      : "";

    const timestamp = new Date().toISOString();

    // Append values (User-entered allows formulas)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          timestamp,    // A
          name,         // B
          contact,      // C
          postcode,     // D
          enquiry,      // E
          summary,      // F
          hyperlinkFormula // G (Photo Links)
        ]]
      }
    });

    return res.status(200).json({ ok: true, photoLinks: links });
  } catch (e) {
    console.error("LOG API error:", e?.response?.data || e?.message || e);
    return res.status(500).json({ error: "Failed to log lead with images." });
  }
};

// helpers
function sanitizeName(s) { return String(s || "").replace(/[^\w.\-]+/g, "_").slice(0, 120); }
function bufferToStream(buffer) {
  const { Readable } = require("stream");
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

