"""Bake cream-tinted copies of the slot icons into UI.json (cslotT) so tiles draw them as images, not CSS masks."""
import base64, io, json, pathlib
from PIL import Image

UI = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "UI.json"
CREAM = (241, 234, 216)


def tint(b64, rgb):
    im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    a = im.getchannel("A")
    out = Image.new("RGBA", im.size, rgb + (0,))
    out.putalpha(a)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


text = UI.read_text(encoding="utf-8")
ui = json.loads(text)
ui["cslotT"] = {k: tint(v, CREAM) for k, v in ui["cslot"].items()}
UI.write_text(json.dumps(ui, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="")
print(len(ui["cslotT"]), "slot icons tinted")
