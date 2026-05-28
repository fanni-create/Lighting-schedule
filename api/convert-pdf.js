const sharp = require("sharp");

// Alias @napi-rs/canvas as 'canvas' so pdfjs-dist finds it
const napiCanvas = require("@napi-rs/canvas");
require.cache[require.resolve("canvas")] = {
  id: "canvas",
  filename: "canvas",
  loaded: true,
  exports: napiCanvas,
};

const PDFJS = require("pdfjs-dist/legacy/build/pdf.js");
PDFJS.GlobalWorkerOptions.workerSrc = require.resolve(
  "pdfjs-dist/legacy/build/pdf.worker.js"
);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    const { createCanvas } = napiCanvas;

    const pdfData = new Uint8Array(Buffer.from(base64, "base64"));
    const doc = await PDFJS.getDocument({
      data: pdfData,
      verbosity: 0,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;

    const MARGIN = 80;
    const BORDER_H = 3;
    const LOGO_H = 50;
    const scale = 150 / 72;

    let logoBuffer = null;
    if (logoBase64) {
      const d = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64;
      logoBuffer = Buffer.from(d, "base64");
    }

    const pages = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale });
      const W = Math.floor(vp.width);
      const H = Math.floor(vp.height);

      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");

      await page.render({
        canvasContext: ctx,
        viewport: vp,
        canvasFactory: {
          create: (w, h) => {
            const c = createCanvas(w, h);
            return { canvas: c, context: c.getContext("2d") };
          },
          reset: (cc, w, h) => {
            cc.canvas.width = w;
            cc.canvas.height = h;
          },
          destroy: () => {},
        },
      }).promise;

      const pagePng = canvas.toBuffer("image/png");

      const redLine = await sharp({
        create: { width: W, height: BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
      }).png().toBuffer();

      const composites = [{ input: redLine, top: MARGIN - BORDER_H, left: 0 }];

      if (logoBuffer) {
        const resized = await sharp(logoBuffer)
          .resize(null, LOGO_H, { fit: "inside" })
          .toBuffer();
        composites.push({
          input: resized,
          top: Math.floor((MARGIN - BORDER_H - LOGO_H) / 2),
          left: 24,
        });
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
        create: { width: W, height: H + MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite([
        { input: marginBar, top: 0, left: 0 },
        { input: pagePng, top: MARGIN, left: 0 },
      ]).png().toBuffer();

      pages.push({
        page: i,
        dataUrl: "data:image/png;base64," + final.toString("base64"),
      });
    }

    return res.status(200).json({ pages });
  } catch (err) {
    console.error("PDF error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
