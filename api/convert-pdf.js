const sharp = require("sharp");
const PDFJS = require("pdfjs-dist/es5/build/pdf.js");

// Disable worker entirely for Node.js
PDFJS.GlobalWorkerOptions.workerSrc = "";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    const pdfData = new Uint8Array(Buffer.from(base64, "base64"));
    const doc = await PDFJS.getDocument({
      data: pdfData,
      verbosity: 0,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
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

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const vp = page.getViewport({ scale });
      const W = Math.floor(vp.width);
      const H = Math.floor(vp.height);

      const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
      const ctx = buildCtx(W, H, rgba);

      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const pagePng = await sharp(Buffer.from(rgba.buffer), {
        raw: { width: W, height: H, channels: 4 }
      }).png().toBuffer();

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
        create: { width: W, height: H + MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite([
        { input: marginBar, top: 0, left: 0 },
        { input: pagePng, top: MARGIN, left: 0 }
      ]).png().toBuffer();

      pages.push({ page: pageNum, dataUrl: "data:image/png;base64," + final.toString("base64") });
    }

    return res.status(200).json({ pages });
  } catch (err) {
    console.error("PDF error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

function buildCtx(W, H, rgba) {
  const noop = () => {};
  const ctx = {
    canvas: { width: W, height: H },
    drawImage: noop, beginPath: noop, stroke: noop, fill: noop,
    moveTo: noop, lineTo: noop, closePath: noop, save: noop, restore: noop,
    clip: noop, scale: noop, rotate: noop, translate: noop, transform: noop,
    setTransform: noop, resetTransform: noop, fillRect: noop, clearRect: noop,
    strokeRect: noop, arc: noop, arcTo: noop, bezierCurveTo: noop,
    quadraticCurveTo: noop, rect: noop, isPointInPath: () => false,
    measureText: () => ({ width: 0 }), fillText: noop, strokeText: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: rgba, width: w, height: h }),
    putImageData: noop,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h }),
  };
  ['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit',
   'globalAlpha','globalCompositeOperation','font','textAlign','textBaseline',
   'shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY',
   'imageSmoothingEnabled','imageSmoothingQuality'].forEach(p => {
    Object.defineProperty(ctx, p, { set: noop, get: () => '', configurable: true });
  });
  return ctx;
}
