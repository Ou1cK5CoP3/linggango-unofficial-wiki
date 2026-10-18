"""Strip curios from mods that are not in base Linggango V6.6.5b4 (edits src/data in place)."""
import json, pathlib, re

DATA = pathlib.Path(__file__).resolve().parent.parent / "src" / "data"
# Namespaces whose mod jar is absent from D:\CurseForge\Instances\Linggango\mods
REMOVED = {"wizard_terra_cuiros", "celestial_artifacts", "l2artifacts", "ars_extensions",
           "fallen_traits", "calamitycurios", "raccompat", "ramcompat"}

load = lambda n: json.loads((DATA / f"{n}.json").read_text(encoding="utf-8"))
save = lambda n, v: (DATA / f"{n}.json").write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
gone = lambda i: isinstance(i, str) and i.split(":")[0] in REMOVED

D = load("D")
keep = [d for d in D if not gone(d["id"])]
print("items", len(D), "->", len(keep))

broken = []
for d in keep:
    d["uid"] = [u for u in d["uid"] if not gone(u)]
    ings = {c[0] for c in (d.get("gr") or {}).get("c", []) if isinstance(c, list)}
    if any(map(gone, ings)):
        broken.append((d["n"], sorted(filter(gone, ings))))
# Nyxaris (Shadow Keeper, after Zoranth Newborn) gets its own Path 12
for d in keep:
    if "Nyxaris's treasure bag" in " ".join(d["src"]) and d["t"] < 12:
        d["t"] = d["a"] = 12
        d["why"] = ["Needs a drop from Nyxaris's treasure bag, the Shadow Keeper fought after Zoranth Newborn"]
ORDER = [-1, 0, 2, 3, 4, 5, 6, 6.1, 6.2, 6.3, 7, 8, 9, 10, 11, 12]
by_id = {d["id"]: d for d in keep}
changed = True
while changed:  # a crafted curio is never earlier than a curio it is made from
    changed = False
    for d in keep:
        if d["g"] != "Craft" or not d.get("gr"):
            continue
        late = max((by_id[c[0]] for c in d["gr"]["c"] if isinstance(c, list) and c[0] in by_id),
                   key=lambda x: ORDER.index(x["t"]), default=None)
        if late and ORDER.index(late["t"]) > ORDER.index(d["t"]):
            print("moved", d["n"], d["t"], "->", late["t"], "(needs", late["n"] + ")")
            d["t"] = late["t"]
            d["why"] = [f"Crafted from {late['n']}, which sits on this path"]
            changed = True
save("D", keep)

for n in ("IC", "AN", "NM"):
    v = load(n)
    save(n, {k: x for k, x in v.items() if not gone(k)})
U = load("U")
save("U", [u for u in U if not gone(u["id"])])

print("recipes needing a removed item:", broken)
txt = re.compile(r"Catastrophe Scroll|Celestial Artifacts|Etching|L2 Artifacts|Wizard Terra|Curios of Calamity|Fallen Traits|Ars Extensions")
for d in keep:
    hits = {m for s in d["src"] + d["why"] + [d["fx"]] for m in txt.findall(s)}
    if hits:
        print("text mentions removed mod:", d["n"], sorted(hits))
