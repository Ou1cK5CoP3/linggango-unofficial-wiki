"""Reassemble index.html from src/ (see split.py)."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

lay = json.loads((SRC / "data" / "_layout.json").read_text(encoding="utf-8"))
data = lay["head"] + ",".join(
    f"{n}=" + (SRC / "data" / f"{n}.json").read_text(encoding="utf-8") for n in lay["order"]
) + lay["tail"]

html = (SRC / "shell.html").read_text(encoding="utf-8")
read = lambda n: (SRC / n).read_text(encoding="utf-8")
parts = {"style.css": read("style.css") + "\n" + read("features.css"), "fx3d.js": read("fx3d.js"),
         "app.js": read("features.js") + "\n" + read("app.js")}  # features first: its vars must exist before app.js renders
for name, text in parts.items():
    html = html.replace(f"/*@@{name}@@*/", text)
html = html.replace("/*@@data.js@@*/", data)
(ROOT / "index.html").write_text(html, encoding="utf-8", newline="")
print("index.html", round(len(html.encode()) / 1e6, 2), "MB")
