const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    // Install canvas and pdfjs-dist via npm at runtime
    const tmpDir = os.tmpdir();
    const pkgDir = path.join(tmpDir, "pdf_deps");
    
    if (!fs.existsSync(path.join(pkgDir, "node_modules", "pdfjs-dist"))) {
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "package.json"), '{"name":"deps","version":"1.0.0"}');
      execSync("npm install pdfjs-dist canvas --prefix " + pkgDir, {
        timeout: 120000,
        stdio: "pipe"
      });
    }

    const pdfjsLib = require(path.join(pkgDir, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.js"));
    const { createCanvas } = require(path.join(pkgDir, "node_modules", "canvas"));

    const pdfData = Buffer.from(base64, "base64");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData) });
    const pdfDoc = await loadingTask.promise;

    const MARGIN = 80;
    const BORDER_H = 3;
    const RED = "#cc0000";
    const LOGO_H = 50;

    // Load logo if provided
    let logoImg = null;
    if (logoBase64) {
      const { Image } = require(path.join(pkgDir, "node_modules", "canvas"));
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

      // Render PDF page
      const pageCanvas = createCanvas(W, H);
      const pageCtx = pageCanvas.getContext("2d");
      await page.render({ canvasContext: pageCtx, viewport }).promise;

      // Create final canvas with margin
      const finalCanvas = createCanvas(W, H + MARGIN);
      const ctx = finalCanvas.getContext("2d");

      // White margin
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, MARGIN);

      // Red border line
      ctx.fillStyle = RED;
      ctx.fillRect(0, MARGIN - BORDER_H, W, BORDER_H);

      // Logo
      if (logoImg) {
        const logoW = Math.floor(LOGO_H * (logoImg.width / logoImg.height));
        const logoY = Math.floor((MARGIN - BORDER_H - LOGO_H) / 2);
        ctx.drawImage(logoImg, 24, logoY, logoW, LOGO_H);
      } else {
        ctx.fillStyle = RED;
        ctx.fillRect(0, 0, 6, MARGIN - BORDER_H);
      }

      // PDF page content
      ctx.drawImage(pageCanvas, 0, MARGIN);

      const dataUrl = finalCanvas.toDataURL("image/png");
      pages.push({ page: i, dataUrl });
    }

    return res.status(200).json({ pages });

  } catch (err) {
    console.error("Conversion error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
