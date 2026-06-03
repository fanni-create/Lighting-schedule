import json
import os
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
STORE_ID = os.environ.get("BLOB_STORE_ID", "")
DATA_FILENAME = "lighting-schedule-data.json"

def get_blob_url():
    # Vercel Blob public URL format
    return f"https://blob.vercel-storage.com"

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if not BLOB_TOKEN:
                self._respond(200, {"projects": [], "error": "No blob token"})
                return

            # Try to fetch existing data
            req = urllib.request.Request(
                f"https://blob.vercel-storage.com/{DATA_FILENAME}",
                headers={
                    "Authorization": f"Bearer {BLOB_TOKEN}",
                }
            )
            with urllib.request.urlopen(req, timeout=10) as res:
                raw = res.read().decode("utf-8")
                data = json.loads(raw)
            self._respond(200, data)

        except urllib.error.HTTPError as e:
            if e.code == 404:
                self._respond(200, {"projects": [], "manufacturers": [], "reps": [], "fixtureTypes": [], "library": []})
            else:
                body = e.read().decode() if hasattr(e, 'read') else str(e)
                self._respond(200, {"error": f"HTTP {e.code}: {body}"})
        except Exception as e:
            import traceback
            self._respond(200, {"error": str(e), "trace": traceback.format_exc()})

    def do_POST(self):
        try:
            if not BLOB_TOKEN:
                self._respond(500, {"error": "No blob token configured"})
                return

            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)

            # Upload to Vercel Blob
            req = urllib.request.Request(
                f"https://blob.vercel-storage.com/{DATA_FILENAME}",
                data=body,
                method="PUT",
                headers={
                    "Authorization": f"Bearer {BLOB_TOKEN}",
                    "Content-Type": "application/json",
                    "x-content-type": "application/json",
                    "x-add-random-suffix": "0",
                }
            )
            with urllib.request.urlopen(req, timeout=10) as res:
                result = json.loads(res.read().decode())

            self._respond(200, {"ok": True, "url": result.get("url", "")})

        except Exception as e:
            import traceback
            self._respond(500, {"error": str(e), "trace": traceback.format_exc()})

    def do_OPTIONS(self):
        self._respond(200, {})

    def _respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        pass
