const fs = require("fs");
const os = require("os");
const path = require("path");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    const sharp = require("sharp");

    const pdfData = Buffer.from(base64, "base64");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData) });
    const pdfDoc = await loadingTask.promise;

    const MARGIN = 80;
    const BORDER_H = 3;
    const LOGO_H = 50;
    const scale = 150 / 72;

    // Parse logo if provided
    let logoBuffer = null;
    let logoMeta = null;
    if (logoBase64) {
      const logoData = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64;
      logoBuffer = Buffer.from(logoData, "base64");
      logoMeta = await sharp(logoBuffer).metadata();
    }

    const pages = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const W = Math.floor(viewport.width);
      const H = Math.floor(viewport.height);

      // Render PDF page to raw RGBA pixels using a minimal canvas-like object
      const rawData = new Uint8ClampedArray(W * H * 4);
      const canvasContext = {
        canvas: { width: W, height: H },
        drawImage: () => {},
        getImageData: () => ({ data: rawData }),
        putImageData: () => {},
        beginPath: () => {},
        stroke: () => {},
        fill: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        save: () => {},
        restore: () => {},
        clip: () => {},
        scale: () => {},
        rotate: () => {},
        translate: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        fillRect: (x, y, w, h) => {
          // fill white
          for (let py = y; py < y + h; py++) {
            for (let px = x; px < x + w; px++) {
              const idx = (py * W + px) * 4;
              rawData[idx] = 255; rawData[idx+1] = 255;
              rawData[idx+2] = 255; rawData[idx+3] = 255;
            }
          }
        },
        clearRect: () => {},
        strokeRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => ({}),
        set fillStyle(v) {},
        set strokeStyle(v) {},
        set lineWidth(v) {},
        set lineCap(v) {},
        set lineJoin(v) {},
        set miterLimit(v) {},
        set globalAlpha(v) {},
        set globalCompositeOperation(v) {},
        set font(v) {},
        set textAlign(v) {},
        set textBaseline(v) {},
        set shadowBlur(v) {},
        set shadowColor(v) {},
        set shadowOffsetX(v) {},
        set shadowOffsetY(v) {},
        measureText: () => ({ width: 0 }),
        fillText: () => {},
        strokeText: () => {},
        arc: () => {},
        arcTo: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        rect: () => {},
        isPointInPath: () => false,
      };

      // Initialize white background
      rawData.fill(255);

      await page.render({ canvasContext, viewport }).promise;

      // Build page PNG using sharp from raw RGBA
      const pagePng = await sharp(Buffer.from(rawData.buffer), {
        raw: { width: W, height: H, channels: 4 }
      }).png().toBuffer();

      // Create white margin bar (W x MARGIN)
      const marginBar = await sharp({
        create: { width: W, height: MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      })
      .composite([
        // Red border line at bottom of margin
        {
          input: await sharp({
            create: { width: W, height: BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
          }).png().toBuffer(),
          top: MARGIN - BORDER_H, left: 0
        },
        // Logo if available
        ...(logoBuffer ? [{
          input: await sharp(logoBuffer)
            .resize(null, LOGO_H, { fit: "inside" })
            .toBuffer(),
          top: Math.floor((MARGIN - BORDER_H - LOGO_H) / 2),
          left: 24
        }] : [
          // Red accent bar if no logo
          {
            input: await sharp({
              create: { width: 6, height: MARGIN - BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
            }).png().toBuffer(),
            top: 0, left: 0
          }
        ])
      ])
      .png().toBuffer();

      // Stack margin on top of page
      const finalPng = await sharp({
        create: { width: W, height: H + MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      })
      .composite([
        { input: marginBar, top: 0, left: 0 },
        { input: pagePng, top: MARGIN, left: 0 }
      ])
      .png().toBuffer();

      const dataUrl = "data:image/png;base64," + finalPng.toString("base64");
      pages.push({ page: i, dataUrl });
    }

    return res.status(200).json({ pages });
  } catch (err) {
    console.error("Conversion error:", err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
