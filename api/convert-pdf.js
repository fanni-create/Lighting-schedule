const sharp = require("sharp");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    const { renderPageAsImage, getDocumentProxy } = require("unpdf");

    const pdfData = new Uint8Array(Buffer.from(base64, "base64"));
    const doc = await getDocumentProxy(pdfData);

    const MARGIN = 80;
    const BORDER_H = 3;
    const LOGO_H = 50;

    let logoBuffer = null;
    if (logoBase64) {
      const d = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64;
      logoBuffer = Buffer.from(d, "base64");
    }

    const pages = [];

    for (let i = 1; i <= doc.numPages; i++) {
      // Pass @napi-rs/canvas as the canvas implementation
      const imgBuffer = await renderPageAsImage(doc, i, {
        scale: 150 / 72,
        canvas: () => import("@napi-rs/canvas"),
      });
      const pagePng = Buffer.from(imgBuffer);

      const meta = await sharp(pagePng).metadata();
      const W = meta.width;

      const redLine = await sharp({
        create: { width: W, height: BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
      }).png().toBuffer();

      const composites = [{ input: redLine, top: MARGIN - BORDER_H, left: 0 }];

      if (logoBuffer) {
        const resized = await sharp(logoBuffer).resize(null, LOGO_H, { fit: "inside" }).toBuffer();
        composites.push({ input: resized, top: Math.floor((MARGIN - BORDER_H - LOGO_H) / 2), left: 24 });
      } else {
        const accent = await sharp({
          create: { width: 6, height: MARGIN - BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
        }).png().toBuffer();
        composites.push({ input: accent, top: 0, left: 0 });
      }

      const marginBar = await sharp({
        create: { width: W, height: MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite(composites).png().toBuffer();

      const final = await sharp({
        create: { width: W, height: meta.height + MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite([
        { input: marginBar, top: 0, left: 0 },
        { input: pagePng, top: MARGIN, left: 0 }
      ]).png().toBuffer();

      pages.push({ page: i, dataUrl: "data:image/png;base64," + final.toString("base64") });
    }

    return res.status(200).json({ pages });
  } catch (err) {
    console.error("PDF error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
