const sharp = require("sharp");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { base64, logoBase64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "Missing PDF data" });

  try {
    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Load PDF in browser page using PDF.js CDN
    const pdfDataUrl = "data:application/pdf;base64," + base64;

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>* { margin: 0; padding: 0; } canvas { display: block; }</style>
      </head>
      <body>
        <div id="pages"></div>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          async function render() {
            const doc = await pdfjsLib.getDocument('${pdfDataUrl}').promise;
            const container = document.getElementById('pages');
            window._pageCount = doc.numPages;
            window._pages = [];
            for (let i = 1; i <= doc.numPages; i++) {
              const pg = await doc.getPage(i);
              const vp = pg.getViewport({ scale: 150/72 });
              const canvas = document.createElement('canvas');
              canvas.width = Math.floor(vp.width);
              canvas.height = Math.floor(vp.height);
              container.appendChild(canvas);
              await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
              window._pages.push(canvas.toDataURL('image/png'));
            }
            window._done = true;
          }
          render();
        </script>
      </body>
      </html>
    `);

    await page.waitForFunction("window._done === true", { timeout: 120000 });
    const pageDataUrls = await page.evaluate(() => window._pages);
    await browser.close();

    const MARGIN = 80;
    const BORDER_H = 3;
    const LOGO_H = 50;

    let logoBuffer = null;
    if (logoBase64) {
      const d = logoBase64.includes(",") ? logoBase64.split(",")[1] : logoBase64;
      logoBuffer = Buffer.from(d, "base64");
    }

    const pages = [];
    for (let i = 0; i < pageDataUrls.length; i++) {
      const pngData = pageDataUrls[i].split(",")[1];
      const pageBuf = Buffer.from(pngData, "base64");
      const meta = await sharp(pageBuf).metadata();
      const W = meta.width;
      const H = meta.height;

      const redLine = await sharp({
        create: { width: W, height: BORDER_H, channels: 3, background: { r: 204, g: 0, b: 0 } }
      }).png().toBuffer();

      const composites = [{ input: redLine, top: MARGIN - BORDER_H, left: 0 }];
      if (logoBuffer) {
        const resized = await sharp(logoBuffer).resize(null, LOGO_H, { fit: "inside" }).toBuffer();
        composites.push({ input: resized, top: Math.floor((MARGIN - BORDER_H - LOGO_H) / 2), left: 24 });
      }

      const marginBar = await sharp({
        create: { width: W, height: MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite(composites).png().toBuffer();

      const final = await sharp({
        create: { width: W, height: H + MARGIN, channels: 3, background: { r: 255, g: 255, b: 255 } }
      }).composite([
        { input: marginBar, top: 0, left: 0 },
        { input: pageBuf, top: MARGIN, left: 0 }
      ]).png().toBuffer();

      pages.push({ page: i + 1, dataUrl: "data:image/png;base64," + final.toString("base64") });
    }

    return res.status(200).json({ pages });
  } catch (err) {
    console.error("PDF error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
