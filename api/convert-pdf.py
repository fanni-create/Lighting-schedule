from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import os
import tempfile

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            pdf_base64 = data.get('base64', '')
            logo_base64 = data.get('logoBase64', '')
            
            if not pdf_base64:
                self._respond(400, {'error': 'Missing PDF data'})
                return

            from pdf2image import convert_from_bytes
            from PIL import Image, ImageDraw

            pdf_bytes = base64.b64decode(pdf_base64)
            pages = convert_from_bytes(pdf_bytes, dpi=150)

            MARGIN = 80
            LOGO_H = 50
            BORDER_H = 3
            BORDER_COLOR = (204, 0, 0)

            # Load logo if provided
            logo = None
            if logo_base64:
                logo_data = logo_base64.split(',')[1] if ',' in logo_base64 else logo_base64
                logo = Image.open(io.BytesIO(base64.b64decode(logo_data))).convert("RGBA")

            results = []
            for i, page in enumerate(pages):
                page = page.convert("RGBA")
                W, H = page.size

                new_img = Image.new("RGBA", (W, H + MARGIN), (255, 255, 255, 255))
                draw = ImageDraw.Draw(new_img)
                draw.rectangle([0, 0, W, MARGIN], fill=(255, 255, 255, 255))
                draw.rectangle([0, MARGIN - BORDER_H, W, MARGIN], fill=(*BORDER_COLOR, 255))

                if logo:
                    ratio = logo.width / logo.height
                    logo_w = int(LOGO_H * ratio)
                    logo_resized = logo.resize((logo_w, LOGO_H), Image.LANCZOS)
                    logo_y = (MARGIN - BORDER_H - LOGO_H) // 2
                    new_img.paste(logo_resized, (24, logo_y), logo_resized)
                else:
                    draw.rectangle([0, 0, 6, MARGIN - BORDER_H], fill=(*BORDER_COLOR, 255))

                new_img.paste(page, (0, MARGIN))
                final = new_img.convert("RGB")
                buf = io.BytesIO()
                final.save(buf, format="PNG", optimize=True)
                b64 = base64.b64encode(buf.getvalue()).decode()
                results.append({"page": i + 1, "dataUrl": f"data:image/png;base64,{b64}"})

            self._respond(200, {'pages': results})

        except Exception as e:
            self._respond(500, {'error': str(e)})

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
