module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) return res.status(500).json({ error: "Redis not configured" });

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  try {
    if (req.method === "GET") {
      const res2 = await fetch(`${url}/get/lighting-schedule-data`, { headers });
      const data = await res2.json();
      if (!data.result) return res.status(200).json({});
      return res.status(200).json(JSON.parse(data.result));
    }

    if (req.method === "POST") {
      const incoming = req.body;

      // Load existing data
      let existing = {};
      try {
        const existRes = await fetch(`${url}/get/lighting-schedule-data`, { headers });
        const existData = await existRes.json();
        if (existData.result) existing = JSON.parse(existData.result);
      } catch(e) {}

      // Merge projects by ID - newer updatedAt wins
      const projectMap = {};
      (existing.projects || []).forEach(p => { projectMap[p.id] = p; });
      (incoming.projects || []).forEach(p => {
        const ex = projectMap[p.id];
        if (!ex || (p.updatedAt || 0) >= (ex.updatedAt || 0)) {
          projectMap[p.id] = p;
        }
      });

      const mergeArrays = (a, b) => [...new Set([...(a||[]), ...(b||[])])];
      const mergeLibrary = (a, b) => {
        const map = {};
        [...(a||[]), ...(b||[])].forEach(f => { map[f.libraryId || f.id] = f; });
        return Object.values(map);
      };

      const merged = {
        projects: Object.values(projectMap),
        manufacturers: mergeArrays(existing.manufacturers, incoming.manufacturers),
        reps: mergeArrays(existing.reps, incoming.reps),
        fixtureTypes: mergeArrays(existing.fixtureTypes, incoming.fixtureTypes),
        library: mergeLibrary(existing.library, incoming.library),
        brand: incoming.brand || existing.brand,
      };

      // Save to Redis with no expiry
      const saveRes = await fetch(`${url}/set/lighting-schedule-data`, {
        method: "POST",
        headers,
        body: JSON.stringify(JSON.stringify(merged)),
      });

      if (!saveRes.ok) {
        const err = await saveRes.text();
        return res.status(500).json({ error: err });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
