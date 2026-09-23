#!/usr/bin/env python3
"""Lokální dev server pro _novy admin: statické soubory + /__save/ zápis bez GitHubu."""

import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler
from http.server import ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

DEFAULT_PORT = 8766
ROOT = os.path.dirname(os.path.abspath(__file__))
ALLOWED_PREFIXES = ("data/", "models/", "thumbs/", "images/")
MAX_BODY = 60 * 1024 * 1024  # 60 MB

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}


def guess_mime(path):
    _, ext = os.path.splitext(path)
    return MIME_TYPES.get(ext.lower(), "application/octet-stream")


def safe_save_path(relpath):
    """Ověří relpath a vrátí absolutní cestu v ROOT, nebo None při porušení pravidel."""
    if relpath is None:
        return None
    # zakázat zpětná lomítka a přímé pokusy o výstup z rootu
    if "\\" in relpath:
        return None
    if relpath.startswith("/") or relpath.startswith("~"):
        return None
    # windows absolutní cesta typu C:\...
    if len(relpath) >= 2 and relpath[1] == ":":
        return None
    if ".." in relpath.split("/"):
        return None
    if not any(relpath.startswith(p) for p in ALLOWED_PREFIXES):
        return None

    candidate = os.path.normpath(os.path.join(ROOT, relpath))
    root_norm = os.path.normpath(ROOT)
    if os.path.commonpath([candidate, root_norm]) != root_norm:
        return None
    return candidate


class Handler(BaseHTTPRequestHandler):
    server_version = "KrakyDevServer/1.0"

    def log_message(self, fmt, *args):
        print(f"{self.command} {self.path} -> {fmt % args}")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)

        if path == "/__save/ping":
            self._send_json(200, {"ok": True})
            return

        if path.startswith("/__save/"):
            self._send_json(404, {"ok": False, "error": "Neznámý endpoint."})
            return

        self._serve_static(path)

    def _serve_static(self, path):
        # složka -> její index.html (jako GitHub Pages)
        if path.endswith("/"):
            path += "index.html"
        relpath = path.lstrip("/")
        full = os.path.normpath(os.path.join(ROOT, relpath))
        root_norm = os.path.normpath(ROOT)
        if os.path.commonpath([full, root_norm]) != root_norm or not os.path.isfile(full):
            self._send_json(404, {"ok": False, "error": "Soubor nenalezen."})
            return
        try:
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            self._send_json(500, {"ok": False, "error": "Chyba při čtení souboru."})
            return
        self.send_response(200)
        self.send_header("Content-Type", guess_mime(full))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_PUT(self):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if not path.startswith("/__save/"):
            self._send_json(403, {"ok": False, "error": "Zakázaná cesta."})
            return
        relpath = path[len("/__save/"):]

        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY:
            self._send_json(413, {"ok": False, "error": "Soubor je příliš velký (max. 60 MB)."})
            # i tak je potřeba tělo přečíst/zahodit, jinak spojení zůstane viset
            self.rfile.read(length)
            return

        full = safe_save_path(relpath)
        if full is None:
            self._send_json(403, {"ok": False, "error": "Zakázaná cesta."})
            self.rfile.read(length)
            return

        body = self.rfile.read(length) if length > 0 else b""

        os.makedirs(os.path.dirname(full), exist_ok=True)
        dir_ = os.path.dirname(full)
        fd, tmp_path = tempfile.mkstemp(prefix=".tmp_", dir=dir_)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(body)
            os.replace(tmp_path, full)
        except OSError:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            self._send_json(500, {"ok": False, "error": "Zápis souboru selhal."})
            return

        self._send_json(200, {"ok": True, "path": relpath, "bytes": len(body)})

    def do_DELETE(self):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if not path.startswith("/__save/"):
            self._send_json(403, {"ok": False, "error": "Zakázaná cesta."})
            return
        relpath = path[len("/__save/"):]

        full = safe_save_path(relpath)
        if full is None:
            self._send_json(403, {"ok": False, "error": "Zakázaná cesta."})
            return

        if os.path.exists(full):
            try:
                os.remove(full)
            except OSError:
                self._send_json(500, {"ok": False, "error": "Smazání souboru selhalo."})
                return
        self._send_json(200, {"ok": True})


def main():
    global ROOT
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    root = sys.argv[2] if len(sys.argv) > 2 else ROOT
    ROOT = os.path.abspath(root)

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Kraky dev server běží na http://127.0.0.1:{port} (root: {ROOT})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
