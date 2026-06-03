const { put, get } = require("@vercel/blob");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });

  try {
    if (req.method === "GET") {
      try {
        const response = await fetch(
          "https://blob.vercel-storage.com/lighting-schedule-data.json",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) return res.status(200).json({});
        const data = await response.json();
        return res.status(200).json(data);
      } catch(e) {
        return res.status(200).json({});
      }
    }

    if (req.method === "POST") {
      const data = req.body;
      const blob = await put("lighting-schedule-data.json", JSON.stringify(data), {
        access: "public",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.status(200).json({ ok: true, url: blob.url });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
