"""Write src/data/RL.json: per-level relic progression from the pack's Relics / More Relics configs and lang files."""
import json, pathlib, re, sys, zipfile

INST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r"D:\CurseForge\Instances\Linggango")
OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "RL.json"
SETS = [("relics", INST / "config/relics/relics", "relics-*.jar"), ("morerelics", INST / "config/morerelics/relics", "morerelics-*.jar")]


def parse_yaml(text):
    """Enough YAML for these configs: nested maps of scalars, '{ }' empty maps, # comments."""
    root, stack = {}, [(-1, None)]
    stack[0] = (-1, root)
    for raw in text.splitlines():
        line = raw.split(" #")[0].rstrip() if not raw.lstrip().startswith("#") else ""
        if not line.strip() or line.strip() in ("{", "}"):
            continue
        ind = len(line) - len(line.lstrip())
        key, _, val = line.strip().partition(":")
        key, val = key.strip().strip("'"), val.strip()
        while stack[-1][0] >= ind:
            stack.pop()
        parent = stack[-1][1]
        if val in ("", "{", "{ }", "{}"):
            parent[key] = {}
            stack.append((ind, parent[key]))
        else:
            try:
                parent[key] = float(val)
            except ValueError:
                parent[key] = val.strip("'")
    return root


def lang(pattern):
    jar = next(INST.glob("mods/" + pattern))
    z = zipfile.ZipFile(jar)
    return json.loads(next(z.read(n) for n in z.namelist() if n.endswith("lang/en_us.json")).decode("utf-8"))


OPS = {"ADD": "A", "MULTIPLY_BASE": "MB", "MULTIPLY_TOTAL": "MT"}
CURIOS = {d["id"]: d for d in json.loads((OUT.parent / "D.json").read_text(encoding="utf-8"))}
UNMATCHED = []


def scale(ability, s, rows):
    """Display factor (1 or 100): the mods format some fractions as percents; read it off the wiki's own text."""
    row = next((r for r in rows if ability in r and s["n"] in r), "")
    seg = row.split(s["n"], 1)[1].split(";")[0].split("(")[0] if row else ""
    shown = sorted(float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", seg)[:2])
    cfg = sorted([abs(s["lo"]), abs(s["hi"])])
    for f in (1, 100):
        if shown and len(shown) == len(set(cfg)) and all(abs(w - c * f) <= max(0.011, abs(c * f) * 0.02) for w, c in zip(shown, sorted(set(cfg)))):
            return f
    UNMATCHED.append(f"{ability} / {s['n']}: cfg {cfg} wiki {shown or '-'}")
    return 100 if "%%" in s["f"] and max(cfg) < 10 else 1


def num(x):
    return int(x) if x == int(x) else round(x, 4)


out = {}
for ns, folder, jar in SETS:
    L = lang(jar)
    for f in sorted(folder.glob("*.yaml")):
        if f"{ns}:{f.stem}" not in CURIOS:
            continue
        item, c = f.stem, parse_yaml(f.read_text(encoding="utf-8"))
        key = f"tooltip.relics.{item}.ability."
        abs_ = []
        for ak, a in c["abilitiesData"]["abilities"].items():
            sts = []
            for sk, s in (a.get("stats") or {}).items():
                sts.append({"k": sk, "n": L.get(f"{key}{ak}.stat.{sk}.title", sk).rstrip(":"),
                            "f": L.get(f"{key}{ak}.stat.{sk}.value", "%1$s"),
                            "lo": num(s["minInitialValue"]), "hi": num(s["maxInitialValue"]),
                            "m": num(s["upgradeModifier"]), "op": OPS[s["upgradeOperation"]]})
            abs_.append({"k": ak, "n": L.get(key + ak, ak.replace("_", " ").title()), "rq": int(a["requiredLevel"]),
                         "pt": int(a["requiredPoints"]), "mx": int(a["maxLevel"]), "st": sts})
        rows = [x for t, x in zip(CURIOS[f"{ns}:{item}"]["tg"], CURIOS[f"{ns}:{item}"]["st"]) if t == "relic"]
        for a in abs_:
            for s in a["st"]:
                s["x"] = scale(a["n"], s, rows)
        lv = c["levelingData"]
        out[f"{ns}:{item}"] = {"mx": int(lv["maxLevel"]), "xp": [num(lv["initialCost"]), num(lv["step"])], "ab": abs_}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="")
print(len(out), "relics ->", OUT)
print(len(UNMATCHED), "stats fell back to the % rule:", *UNMATCHED, sep="\n  ")
