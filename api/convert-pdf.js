const fs = require("fs");
const sharp = require("sharp");

// Disable pdfjs worker - not needed in Node.js
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = false;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    const pdfData = Buffer.from(base64, "base64");
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdfDoc = await loadingTask.promise;

    const MARGIN = 80;
    const BORDER_H = 3;
    const LOGO_H = 50;
    const scale = 150 / 72;

    let logoBuffer = null;
    if (logoBase64) {
      const logoData = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64;
      logoBuffer = Buffer.from(logoData, "base64");
    }

    const pages = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const W = Math.floor(viewport.width);
      const H = Math.floor(viewport.height);

      // Render to raw RGBA buffer
      const rawData = new Uint8ClampedArray(W * H * 4).fill(255);
      const fakeCtx = buildFakeContext(W, H, rawData);
      await page.render({ canvasContext: fakeCtx, viewport }).promise;

      const pagePng = await sharp(Buffer.from(rawData.buffer), {
        raw: { width: W, height: H, channels: 4 }
      }).png().toBuffer();

      // Build margin with logo
      const composites = [
        {
          input: await sharp({
            create: { width: W, height: BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
          }).png().toBuffer(),
          top: MARGIN - BORDER_H, left: 0
        }
      ];

      if (logoBuffer) {
        composites.push({
          input: await sharp(logoBuffer).resize(null, LOGO_H, { fit: "inside" }).toBuffer(),
          top: Math.floor((MARGIN - BORDER_H - LOGO_H) / 2),
          left: 24
        });
      } else {
        composites.push({
          input: await sharp({
            create: { width: 6, height: MARGIN - BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
          }).png().toBuffer(),
          top: 0, left: 0
        });
      }

      const marginBar = await sharp({
        create: { width: W, height: MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite(composites).png().toBuffer();

      const finalPng = await sharp({
        create: { width: W, height: H + MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite([
        { input: marginBar, top: 0, left: 0 },
        { input: pagePng, top: MARGIN, left: 0 }
      ]).png().toBuffer();

      pages.push({ page: i, dataUrl: "data:image/png;base64," + finalPng.toString("base64") });
    }

    return res.status(200).json({ pages });
  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

function buildFakeContext(W, H, rawData) {
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
    getImageData: (x, y, w, h) => ({ data: rawData, width: w, height: h }),
    putImageData: noop,
  };
  const props = ['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin',
    'miterLimit','globalAlpha','globalCompositeOperation','font','textAlign',
    'textBaseline','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY',
    'imageSmoothingEnabled','imageSmoothingQuality'];
  props.forEach(p => Object.defineProperty(ctx, p, { set: noop, get: () => '' }));
  return ctx;
}
