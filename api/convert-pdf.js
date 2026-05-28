const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    const { createCanvas, Image } = require("canvas");

    const pdfData = Buffer.from(base64, "base64");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData) });
    const pdfDoc = await loadingTask.promise;

    const MARGIN = 80;
    const BORDER_H = 3;
    const LOGO_H = 50;

    let logoImg = null;
    if (logoBase64) {
      logoImg = new Image();
      const logoData = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64;
      logoImg.src = Buffer.from(logoData, "base64");
    }

    const pages = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const scale = 150 / 72;
      const viewport = page.getViewport({ scale });
      const W = Math.floor(viewport.width);
      const H = Math.floor(viewport.height);

      const pageCanvas = createCanvas(W, H);
      const pageCtx = pageCanvas.getContext("2d");
      await page.render({ canvasContext: pageCtx, viewport }).promise;

      const finalCanvas = createCanvas(W, H + MARGIN);
      const ctx = finalCanvas.getContext("2d");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H + MARGIN);
      ctx.fillStyle = "#cc0000";
      ctx.fillRect(0, MARGIN - BORDER_H, W, BORDER_H);

      if (logoImg) {
        const logoW = Math.floor(LOGO_H * (logoImg.width / logoImg.height));
        const logoY = Math.floor((MARGIN - BORDER_H - LOGO_H) / 2);
        ctx.drawImage(logoImg, 24, logoY, logoW, LOGO_H);
      } else {
        ctx.fillStyle = "#cc0000";
        ctx.fillRect(0, 0, 6, MARGIN - BORDER_H);
      }

      ctx.drawImage(pageCanvas, 0, MARGIN);
      pages.push({ page: i, dataUrl: finalCanvas.toDataURL("image/png") });
    }

    return res.status(200).json({ pages });
  } catch (err) {
    console.error("Conversion error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
