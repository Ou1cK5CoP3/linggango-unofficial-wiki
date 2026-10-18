"""Reassemble index.html from src/ (see split.py)."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

lay = json.loads((SRC / "data" / "_layout.json").read_text(encoding="utf-8"))
data = lay["head"] + ",".join(
    f"{n}=" + (SRC / "data" / f"{n}.json").read_text(encoding="utf-8") for n in lay["order"]
) + lay["tail"]

html = (SRC / "shell.html").read_text(encoding="utf-8")
for name in ("style.css", "fx3d.js", "app.js"):
    html = html.replace(f"/*@@{name}@@*/", (SRC / name).read_text(encoding="utf-8"))
html = html.replace("/*@@data.js@@*/", data)
(ROOT / "index.html").write_text(html, encoding="utf-8", newline="")
print("index.html", round(len(html.encode()) / 1e6, 2), "MB")
