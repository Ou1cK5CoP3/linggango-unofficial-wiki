"""Split index.html into editable parts under src/ (run once; build.py reassembles)."""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
h = (ROOT / "index.html").read_text(encoding="utf-8")

parts = list(re.finditer(r"(<(script|style)[^>]*>)(.*?)(</\2>)", h, re.S))
big_style = max((p for p in parts if p.group(2) == "style"), key=lambda p: len(p.group(3)))
scripts = [p for p in parts if p.group(2) == "script"]
names = {big_style: "style.css", scripts[0]: "data.js", scripts[1]: "fx3d.js", scripts[2]: "app.js"}

shell, pos = [], 0
SRC.mkdir(exist_ok=True)
for p, name in sorted(names.items(), key=lambda kv: kv[0].start()):
    shell.append(h[pos:p.start(3)] + f"/*@@{name}@@*/")
    pos = p.end(3)
    if name != "data.js":
        (SRC / name).write_text(p.group(3), encoding="utf-8", newline="")
shell.append(h[pos:])
(SRC / "shell.html").write_text("".join(shell), encoding="utf-8", newline="")

# data.js is "const D=[..],IC={..},...;\nwindow.B3=B3;" -> one JSON file per constant
data = scripts[0].group(3)
body, tail = data.split(";\nwindow.B3=B3;")
head = re.match(r"\s*const ", body).group(0)
dec = json.JSONDecoder()
i, order = len(head), []
while i < len(body):
    name = re.match(r"([A-Za-z_$]\w*)=", body[i:]).group(1)
    i += len(name) + 1
    val, i = dec.raw_decode(body, i)
    order.append(name)
    (SRC / "data").mkdir(exist_ok=True)
    (SRC / "data" / f"{name}.json").write_text(json.dumps(val, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if i < len(body):
        assert body[i] == ",", body[i:i + 20]
        i += 1
(SRC / "data" / "_layout.json").write_text(json.dumps({"head": head, "order": order, "tail": ";\nwindow.B3=B3;" + tail}), encoding="utf-8")
print("split:", order)
