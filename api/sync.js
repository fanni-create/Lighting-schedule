module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;

  if (!token) return res.status(500).json({ error: "No token", env: Object.keys(process.env).filter(k => k.includes("BLOB")) });

  try {
    if (req.method === "GET") {
      // List blobs using Vercel Blob API directly
      const listRes = await fetch(`https://blob.vercel-storage.com?prefix=lighting-schedule-data`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        }
      });
      const listData = await listRes.json();
      
      if (!listData.blobs || listData.blobs.length === 0) {
        return res.status(200).json({});
      }

      // Fetch the actual data
      const dataRes = await fetch(listData.blobs[0].url);
      if (!dataRes.ok) return res.status(200).json({});
      const data = await dataRes.json();
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const data = JSON.stringify(req.body);
      
      // Upload to Vercel Blob
      const uploadRes = await fetch(`https://blob.vercel-storage.com/lighting-schedule-data.json`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-content-type": "application/json",
          "x-add-random-suffix": "0",
        },
        body: data,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        return res.status(500).json({ error: err });
      }

      const result = await uploadRes.json();
      return res.status(200).json({ ok: true, url: result.url });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
