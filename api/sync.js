const FILENAME = "lighting-schedule-data.json";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });

  try {
    if (req.method === "GET") {
      const listRes = await fetch(`https://blob.vercel-storage.com?prefix=${FILENAME}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const listData = await listRes.json();
      if (!listData.blobs || listData.blobs.length === 0) return res.status(200).json({});
      const dataRes = await fetch(listData.blobs[0].url);
      if (!dataRes.ok) return res.status(200).json({});
      const data = await dataRes.json();
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const incoming = req.body;

      // Load existing data first
      let existing = {};
      try {
        const listRes = await fetch(`https://blob.vercel-storage.com?prefix=${FILENAME}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const listData = await listRes.json();
        if (listData.blobs && listData.blobs.length > 0) {
          const dataRes = await fetch(listData.blobs[0].url);
          if (dataRes.ok) existing = await dataRes.json();
        }
      } catch(e) {}

      // Merge projects by ID - each project is identified by its id
      const existingProjects = existing.projects || [];
      const incomingProjects = incoming.projects || [];

      // Merge projects by ID - newer updatedAt wins
      const projectMap = {};
      existingProjects.forEach(p => { projectMap[p.id] = p; });
      incomingProjects.forEach(p => {
        const existing = projectMap[p.id];
        // If project exists, keep the newer version
        if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) {
          projectMap[p.id] = p;
        }
      });

      const mergedProjects = Object.values(projectMap);

      // Merge manufacturers, reps, fixtureTypes (union)
      const mergeArrays = (a, b) => [...new Set([...(a||[]), ...(b||[])])];
      const mergeLibrary = (a, b) => {
        const map = {};
        [...(a||[]), ...(b||[])].forEach(f => { map[f.libraryId || f.id] = f; });
        return Object.values(map);
      };

      const merged = {
        projects: mergedProjects,
        manufacturers: mergeArrays(existing.manufacturers, incoming.manufacturers),
        reps: mergeArrays(existing.reps, incoming.reps),
        fixtureTypes: mergeArrays(existing.fixtureTypes, incoming.fixtureTypes),
        library: mergeLibrary(existing.library, incoming.library),
        brand: incoming.brand || existing.brand,
        activeProjectId: incoming.activeProjectId || existing.activeProjectId,
      };

      // Save merged data
      const uploadRes = await fetch(`https://blob.vercel-storage.com/${FILENAME}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "x-content-type": "application/json",
          "x-add-random-suffix": "0",
        },
        body: JSON.stringify(merged),
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
