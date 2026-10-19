"""Write src/data/RL.json: per-level relic progression from the pack's Relics / More Relics configs, lang files and jar bytecode."""
import glob, json, os, pathlib, re, subprocess, sys, tempfile, zipfile

INST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r"D:\CurseForge\Instances\Linggango")
OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "RL.json"
SETS = [("relics", INST / "config/relics/relics", "relics-*.jar"), ("morerelics", INST / "config/morerelics/relics", "morerelics-*.jar")]
JAVAP = next(iter(sorted(glob.glob(r"C:\Program Files\Java\jdk-*\bin\javap.exe"), reverse=True)), "javap")
INF = 1e300


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


def lang(z):
    return json.loads(next(z.read(n) for n in z.namelist() if n.endswith("lang/en_us.json")).decode("utf-8"))


# javap opcode -> token of the little stack program the site runs (see rlFmt in features.js)
TOK = {"dadd": "+", "iadd": "+", "dsub": "-", "isub": "-", "dmul": "*", "imul": "*", "ddiv": "/", "d2i": "i", "l2i": "", "i2d": "", "i2l": "", "l2d": "",
       "fadd": "+", "fsub": "-", "fmul": "*", "fdiv": "/", "f2i": "i", "l2f": "", "i2f": "", "f2d": "", "d2f": "", "dneg": "n", "fneg": "n",
       "dconst_0": 0, "dconst_1": 1, "fconst_0": 0, "fconst_1": 1, "fconst_2": 2, "iconst_m1": -1, "iconst_0": 0, "iconst_1": 1, "iconst_2": 2, "iconst_3": 3, "iconst_4": 4, "iconst_5": 5}
CALL = {"MathUtils.round": "R", "Math.round": "r", "Integer.valueOf": "I", "Double.valueOf": "D", "Float.valueOf": "D", "Double.doubleValue": "", "Float.floatValue": ""}
SKIPPED, UNK = [], []


def program(body, static):
    """Translate a formatValue lambda body into tokens; None if it does anything else."""
    out = []
    for l in body.split("LineNumberTable")[0].split("\n"):
        m = re.match(r"\d+: ([a-z]\w*)\s*(?:#\d+(?:,\s*\d+)?|(-?\d+))?\s*(?://\s*(.*))?$", l.strip())
        if not m:
            continue
        op, imm, c = m.group(1), m.group(2), m.group(3) or ""
        if op == ("aload_0" if static else "aload_1"):
            out.append("v")
        elif op in ("areturn", "checkcast"):
            pass
        elif op in TOK:
            if TOK[op] != "":
                out.append(TOK[op])
        elif op in ("bipush", "sipush"):
            out.append(int(imm))
        elif op.startswith("ldc") and re.search(r"(double|float|int) ", c):
            out.append(float(c.split()[-1].rstrip("df")))
        elif op.startswith("invoke"):
            name = ".".join(re.sub(r"[:(].*", "", c.split()[-1]).split("/")[-1].split(".")[-2:])
            if name not in CALL:
                UNK.append(name)
                return None
            if CALL[name]:
                out.append(CALL[name])
        else:
            UNK.append(op)
            return None
    return out


def formats(z, tmp):
    """{normalized class name: {"ability.stat": tokens}} for every relic class in the jar."""
    res = {}
    for n in z.namelist():
        if not n.endswith(".class") or "$" in n:
            continue
        data = z.read(n)
        if b"formatValue" not in data:
            continue
        p = os.path.join(tmp, "c.class")
        open(p, "wb").write(data)
        t = subprocess.run([JAVAP, "-p", "-c", "-v", p], capture_output=True, text=True).stdout
        bs = {m.group(1): m.group(2) for m in re.finditer(
            r"\n  (\d+): #\d+ REF_invokeStatic [^\n]*\n\s*Method arguments:\n\s*#\d+ [^\n]*\n\s*#\d+ REF_invoke\w+ ([^\n:]*)", t)}
        bs = {k: v.split(".")[-1] if ".lambda$" in v else {"java/lang/Math.round": ["v", "r", "I"], "java/lang/Double.doubleValue": ["v", "D"]}.get(v, v)
              for k, v in bs.items()}
        bodies = {m.group(2): (m.group(3), "static" in m.group(1)) for m in re.finditer(
            r"\n  ((?:private |public |static )+)[^\n]*?(lambda\$[\w$]+)\([^\n]*\n(.*?)(?=\n\n|\n  [a-z])", t, re.S)}
        ab = st = None
        lines, prog = t.split("\n"), {}
        for i, l in enumerate(lines):
            s = re.search(r"// String (\w+)", lines[i - 1])
            if "AbilityData.builder" in l and s:
                ab = s.group(1)
            if "StatData.builder" in l and s:
                st = s.group(1)
            m = re.search(r"invokedynamic #\d+,\s*0\s*// InvokeDynamic #(\d+):apply", l)
            if m and "formatValue" in lines[i + 1]:
                ref = bs.get(m.group(1))
                b = bodies.get(ref) if isinstance(ref, str) else None
                p_ = ref if isinstance(ref, list) else program(*b) if b else None
                if p_ is None:
                    SKIPPED.append(f"{n} {ab}.{st}")
                else:
                    prog[f"{ab}.{st}"] = p_
        res[re.sub(r"item$", "", pathlib.Path(n).stem.lower())] = prog
    return res


def num(x):
    return int(x) if x == int(x) else round(x, 6)


CURIOS = {d["id"] for d in json.loads((OUT.parent / "D.json").read_text(encoding="utf-8"))}
out, nofmt = {}, []
with tempfile.TemporaryDirectory() as tmp:
    for ns, folder, jar in SETS:
        z = zipfile.ZipFile(next(INST.glob("mods/" + jar)))
        L, F = lang(z), formats(z, tmp)
        for f in sorted(folder.glob("*.yaml")):
            if f"{ns}:{f.stem}" not in CURIOS:
                continue
            item, c = f.stem, parse_yaml(f.read_text(encoding="utf-8"))
            fm = F.get({"enders_hand": "enderhand"}.get(item, item.replace("_", "")))
            if fm is None:
                nofmt.append(f"{ns}:{item}")
            key = f"tooltip.relics.{item}.ability."
            lv = c["levelingData"]
            abs_ = []
            for ak, a in c["abilitiesData"]["abilities"].items():
                sts = []
                for sk, s in (a.get("stats") or {}).items():
                    t = [s["minThresholdValue"], s["maxThresholdValue"]]
                    sts.append({"k": sk, "n": L.get(f"{key}{ak}.stat.{sk}.title", sk).rstrip(":"),
                                "f": L.get(f"{key}{ak}.stat.{sk}.value", "%1$s"),
                                "lo": num(s["minInitialValue"]), "hi": num(s["maxInitialValue"]),
                                "m": num(s["upgradeModifier"]), "op": {"ADD": "A", "MULTIPLY_BASE": "MB", "MULTIPLY_TOTAL": "MT"}[s["upgradeOperation"]],
                                "t": [None if t[0] < -INF else 0 if abs(t[0]) < 1e-300 else num(t[0]), num(t[1]) if t[1] < INF else None],
                                "p": (fm or {}).get(f"{ak}.{sk}", ["v", "D"])})
                mx = int(a["maxLevel"])
                if mx == -1:
                    mx = int(lv["maxLevel"]) // int(a["requiredPoints"])
                abs_.append({"k": ak, "n": L.get(key + ak, ak.replace("_", " ").title()), "rq": int(a["requiredLevel"]),
                             "pt": int(a["requiredPoints"]), "mx": mx if sts else 0, "st": sts})
            out[f"{ns}:{item}"] = {"mx": int(lv["maxLevel"]), "xp": [num(lv["initialCost"]), num(lv["step"])], "ab": abs_}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="")
print(len(out), "relics ->", OUT)
print("no formatValue class (stats use the default display):", nofmt or "none")
print(len(SKIPPED), "formatValue lambdas not understood (shown raw):", *SKIPPED, sep="\n  ")
print("unknown ops:", sorted(set(UNK)))
