from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import traceback
import sys

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            # Read in chunks to handle large PDFs
            body = b''
            remaining = content_length
            while remaining > 0:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    break
                body += chunk
                remaining -= len(chunk)
        except Exception as e:
            self._respond(500, {'error': f'Failed to read request body: {str(e)}'})
            return

        try:
            data = json.loads(body)
            pdf_base64 = data.get('base64', '')
            logo_base64 = data.get('logoBase64', '')
            highlight_terms = data.get('highlightTerms', [])

            if not pdf_base64:
                self._respond(400, {'error': 'Missing PDF data'})
                return

            pdf_bytes = base64.b64decode(pdf_base64)

            from PIL import Image, ImageDraw
            import fitz

            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            MARGIN = 80
            LOGO_H = 50
            BORDER_H = 3
            BORDER_COLOR = (204, 0, 0)
            HIGHLIGHT_COLOR = (255, 235, 0, 160)

            logo = None
            if logo_base64:
                try:
                    logo_data = logo_base64.split(',')[1] if ',' in logo_base64 else logo_base64
                    logo = Image.open(io.BytesIO(base64.b64decode(logo_data))).convert("RGBA")
                except Exception as e:
                    print(f"Logo load failed: {e}", file=sys.stderr)

            results = []
            scale = 150 / 72

            for page_num in range(len(doc)):
                page = doc[page_num]

                # Find highlight positions
                highlight_rects = []
                for term in highlight_terms:
                    if not term or len(term.strip()) < 3:
                        continue
                    for line in term.split('\n'):
                        line = line.strip()
                        if len(line) < 3:
                            continue
                        for search in [line] + ([line.split('-')[0]] if '-' in line else []):
                            for rect in page.search_for(search):
                                highlight_rects.append(rect)

                mat = fitz.Matrix(scale, scale)
                pix = page.get_pixmap(matrix=mat)
                img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
                W, H = img.size

                if highlight_rects:
                    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    draw = ImageDraw.Draw(overlay)
                    for rect in highlight_rects:
                        x0 = int(rect.x0 * scale) - 2
                        y0 = int(rect.y0 * scale) - 2
                        x1 = int(rect.x1 * scale) + 2
                        y1 = int(rect.y1 * scale) + 2
                        draw.rectangle([x0, y0, x1, y1], fill=HIGHLIGHT_COLOR)
                    img = Image.alpha_composite(img, overlay)

                new_img = Image.new("RGBA", (W, H + MARGIN), (255, 255, 255, 255))
                draw2 = ImageDraw.Draw(new_img)
                draw2.rectangle([0, 0, W, MARGIN], fill=(255, 255, 255, 255))
                draw2.rectangle([0, MARGIN - BORDER_H, W, MARGIN], fill=(*BORDER_COLOR, 255))

                if logo:
                    ratio = logo.width / logo.height
                    logo_w = int(LOGO_H * ratio)
                    logo_resized = logo.resize((logo_w, LOGO_H), Image.LANCZOS)
                    logo_y = (MARGIN - BORDER_H - LOGO_H) // 2
                    new_img.paste(logo_resized, (24, logo_y), logo_resized)
                else:
                    draw2.rectangle([0, 0, 6, MARGIN - BORDER_H], fill=(*BORDER_COLOR, 255))

                new_img.paste(img, (0, MARGIN), img)
                final = new_img.convert("RGB")
                buf = io.BytesIO()
                final.save(buf, format="PNG", optimize=True)
                b64 = base64.b64encode(buf.getvalue()).decode()
                results.append({"page": page_num + 1, "dataUrl": f"data:image/png;base64,{b64}"})

            self._respond(200, {'pages': results})

        except Exception as e:
            tb = traceback.format_exc()
            print(f"Error: {e}\n{tb}", file=sys.stderr)
            self._respond(500, {'error': str(e), 'trace': tb})

    def do_OPTIONS(self):
        self._respond(200, {})

    def _respond(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        pass
