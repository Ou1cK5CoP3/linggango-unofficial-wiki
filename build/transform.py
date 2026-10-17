#!/usr/bin/env python3
"""Rebuild the Linggango Relic Wiki data.

Reads the original single-file wiki, then:
  1. re-tiers every relic onto the new Path ladder (Warden / Wither / Ender Dragon
     inserted between Path VI and VII, L2 path renamed to L2 Artifacts),
  2. recomputes rarity (adds the Must-Have tier for Etchings and Looting Charms,
     applies the Terramity scarce-material rule),
  3. rewrites code-like text (config keys, attribute modifiers, loot-table ids)
     into plain English, keeping the raw value for verification,
  4. packs the vanilla 1.20.1 textures used by the new visuals.

Output: build/out/data.js (D, IC, NM, VA) and build/changes.csv.
"""
import base64
import csv
import io
import json
import pathlib
import re

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "original" / "Linggango_Relic_Wiki.original.html"
VAN = ROOT / "assets" / "vanilla"
OUT = ROOT / "build" / "out"

WARDEN, WITHER, DRAGON = 6.1, 6.2, 6.3
ORDER = [-1, 0, 2, 3, 4, 5, 6, WARDEN, WITHER, DRAGON, 7, 8, 9, 10, 11]
# progression value used by the rarity score (old score ≈ 0.21 per Act)
PV = {k: float(k) for k in ORDER}
PV[-1], PV[WARDEN], PV[WITHER], PV[DRAGON] = 1.0, 6.25, 6.5, 6.75
ROMAN = {0: "0", 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X", 11: "XI"}
BOSSNAME = {WARDEN: "the Warden", WITHER: "the Wither", DRAGON: "the Ender Dragon"}
# old score thresholds (lower bound of Uncommon … Mythic), read off the original quantiles
TH = [0.942, 1.5222, 2.0805, 2.5605, 3.0782]
MUST = 6  # rarity index of the Must-Have ★ tier


def load():
    """Parse `const D=[…],U=[…],IC={…},NM={…};` into a dict of JSON values."""
    line = next(l for l in SRC.read_text(encoding="utf-8").split("\n") if l.startswith("const D="))
    s, dec, out, i = line[len("const "):], json.JSONDecoder(), {}, 0
    while True:
        m = re.match(r"([A-Za-z_$]\w*)=", s[i:])
        val, j = dec.raw_decode(s, i + m.end())
        out[m.group(1)] = val
        if s[j] == ";":
            return out
        assert s[j] == ","
        i = j + 1


_L = load()
D, U, IC, NM = _L["D"], _L.get("U", []), _L["IC"], _L["NM"]
# MAR Relics removed from the wiki at the user's request
D = [d for d in D if not d["id"].startswith("marrelics:")]

# More Relics: the old wiki multiplied every Relics-style stat by 100 (Made in Heaven "revive cooldown 86000 s",
# Twin Fangs "4000%"). Rebuild those lines from the StatData values in the mod's own classes
# (morerelics-1.7.7, read with javap) and the titles/units from its lang file.
_MR = pathlib.Path("/tmp/claude-0/-home-user-Linggango-Relic-Wiki/4288cb83-ead3-5324-91d4-51e578dc641c/scratchpad/extract/morerelics")
if (_MR / "stats.json").exists():
    _mst = json.loads((_MR / "stats.json").read_text())["stats"]
    _ml = json.loads((_MR / "en_us.json").read_text())
    def _mfmt(v, unit):
        if "%%" in unit and abs(v) <= 1:
            v *= 100
        v = round(v, 2)
        n = str(int(v)) if v == int(v) else str(v)
        return unit.replace("%1$s", n).replace("%%", "%").rstrip(".")
    for d in D:
        ns, iid = d["id"].split(":")
        # class names split words differently from item ids (ShieldWeaveCape / shieldweave_cape)
        key = next((k for k in _mst if k.replace("_", "") == iid.replace("_", "")), None)
        if ns != "morerelics" or not key:
            continue
        by = {}
        for ab, stn, lo, hi in _mst[key]:
            base = f"tooltip.relics.{iid}.ability.{ab}"
            title = _ml.get(f"{base}.stat.{stn}.title", stn.replace("_", " ").title())
            unit = _ml.get(f"{base}.stat.{stn}.value", "%1$s")
            by.setdefault(_ml.get(base, ab.replace("_", " ").title()), []).append(f"{title} {_mfmt(lo, unit)} ~ {_mfmt(hi, unit)}")
        new = []
        for line in d["st"]:
            head = line.split(":")[0].split(" (unlocks")[0].split(" [active]")[0].strip()
            if head in by:
                new.append(line.split(":")[0] + ": " + "; ".join(by.pop(head)) + " (at relic level 0; grows as the relic levels up)")
            elif not re.match(r"^(Spell\b|.*\b[Ii]cons?: (yes|no)$)", line):
                new.append(line)
        d["st"] = new
NM = {k: re.sub(r"§.", "", v) for k, v in NM.items()}  # strip Minecraft colour codes
BYID = {d["id"]: d for d in D}
BYNAME, NAME2IDS = {}, {}
for k, v in list(NM.items()) + [(d["id"], d["n"]) for d in D]:
    BYNAME.setdefault(v, k)
    NAME2IDS.setdefault(v, [])
    if k not in NAME2IDS[v]:
        NAME2IDS[v].append(k)


def name_id(name, ns):
    """Resolve an ingredient name, preferring the relic's own mod when names collide."""
    ids = NAME2IDS.get(name, [])
    same = [i for i in ids if i.split(":")[0] == ns]
    if same:
        return same[0]
    return ids[0] if len(ids) == 1 else None

# ---------------------------------------------------------------- 1. Paths
MAT = {
    "celestial_core:warden_sclerite": WARDEN, "terramity:warden_soul": WARDEN,
    "l2complements:warden_bone_shard": WARDEN,
    "minecraft:nether_star": WITHER, "celestial_core:pure_nether_star": WITHER,
    "l2complements:force_field": WITHER, "armageddon_mod:withered_splintered_bone": WITHER,
    "minecraft:dragon_egg": DRAGON, "minecraft:dragon_head": DRAGON, "minecraft:shulker_shell": DRAGON,
    "celestial_core:shulker_scrap": DRAGON, "armageddon_mod:ender_dragon_bone": DRAGON,
    "armageddon_mod:heart_of_the_abyss": DRAGON, "minecraft:chorus_fruit": DRAGON,
    "minecraft:popped_chorus_fruit": DRAGON,
}
for nm in ("Khyros's Goldened Tear", "Vitalis Pearl", "Withered Splintered Bone"):
    if nm in BYNAME:
        MAT[BYNAME[nm]] = DRAGON if nm != "Withered Splintered Bone" else WITHER
W = r"(?<!Realm )(?<!Night)Warden"
NOTE_RX = [
    (WARDEN, re.compile(rf"\bbag: Warden\b|^{W} drop|\b{W} drop\b|^{W},|^{W} killed|Warden's Sonic Boom|max health ≥500")),
    (WITHER, re.compile(r"\bbag: Wither\b|\bWither drop\b|^Wither killed|^Wither \(|finish the Wither")),
    (DRAGON, re.compile(r"\bbag: Ender Dragon\b|Ender Dragon drop|^Ender Dragon\b|^chest: End City(?: \d[\d.]*%)?$|\bEnd material\b|\bShulker drop\b|^chest: End City\)?$")),
]


def note_gate(text):
    for p, rx in NOTE_RX:
        if rx.search(text.strip()):
            return p
    return None


def split_top(s, sep):
    """Split on sep outside parentheses."""
    out, depth, cur, i = [], 0, "", 0
    while i < len(s):
        c = s[i]
        depth += c == "("
        depth -= c == ")"
        if depth == 0 and s.startswith(sep, i):
            out.append(cur)
            cur, i = "", i + len(sep)
            continue
        cur += c
        i += 1
    out.append(cur)
    return [x for x in out if x.strip()]


def ingredients(d):
    ids = set()
    if d.get("gr"):
        ids |= {c[0] for c in d["gr"]["c"] if c and c[0]}
    head = split_top(d["src"], " · ")[0].split(". Also:")[0]
    m = re.match(r"^[A-Z][\w' ]+?(?: \([^)]*\))?: (.+)$", head)
    if m:
        for nm in m.group(1).split(", "):
            nm = re.sub(r" ×\d+$", "", nm.strip())
            hit = name_id(nm, d["id"].split(":")[0])
            if hit:
                ids.add(hit)
    # "Upgraded from the X", "evolves from X", "X fed a Nether Star": the earlier stage is an ingredient
    for src in (d["src"] if isinstance(d["src"], list) else [d["src"]]):
        for m in re.finditer(r"(?:[Uu]pgraded|[Ee]volves) from (?:the )?([A-Z][\w' ]+?)(?:[.;,]|$)", src):
            hit = name_id(m.group(1).strip(), d["id"].split(":")[0])
            if hit:
                ids.add(hit)
        m = re.match(r"^([A-Z][\w' ]+?) (?:fed|hit|struck)\b", src)
        if m:
            hit = name_id(m.group(1).strip(), d["id"].split(":")[0])
            if hit:
                ids.add(hit)
        if re.search(r"\bNether Star\b", src):
            ids.add("minecraft:nether_star")
    ids.discard(d["id"])
    return ids


def boss_gate(d):
    """Earliest vanilla-boss path this relic needs (None = no vanilla boss)."""
    parts = split_top(d["src"], " · ")
    gates = []
    head = parts[0].split(". Also:")[0].split(". craftable from")[0]
    is_recipe = bool(re.match(r"^[A-Z][\w' ]+?(?: \([^)]*\))?: ", head)) and not head.startswith(("chest:", "bag:", "archaeology:"))
    if d["g"] == "Loot" or not is_recipe:
        alts = [a for x in split_top(head, "; ") for a in split_top(x, " or ")]
        ag = [note_gate(a) for a in alts]
        if ag and all(ag):
            gates.append(min(ag))
    for c in ingredients(d):
        if c in MAT:
            gates.append(MAT[c])
    for p in parts[1:]:
        m = re.match(r"key item: .*?\((.*)\)\s*$", p)
        if m and note_gate(m.group(1)):
            gates.append(note_gate(m.group(1)))
    return max(gates) if gates else None


GATE = {d["id"]: boss_gate(d) for d in D}
ING = {d["id"]: ingredients(d) & BYID.keys() for d in D}
NT = {d["id"]: d["t"] for d in D}
NA = {d["id"]: d["a"] for d in D}
WHY_ADD = {d["id"]: [] for d in D}
changed = True
while changed:
    changed = False
    for d in D:
        i, g = d["id"], GATE[d["id"]]
        # only follow an ingredient that already bounded this relic (no other route around it)
        up_t = [NT[r] for r in ING[i] if NT[r] > BYID[r]["t"] and d["t"] >= BYID[r]["t"]]
        up_a = [NA[r] for r in ING[i] if NA[r] > BYID[r]["a"] and d["a"] >= BYID[r]["a"]]
        t = max([d["t"]] + ([g] if g else []) + up_t)
        a = max([d["a"]] + ([g] if g else []) + up_a)
        t = max(t, a)
        if t != NT[i] or a != NA[i]:
            NT[i], NA[i], changed = t, a, True

for d in D:
    i, g = d["id"], GATE[d["id"]]
    if NT[i] != d["t"]:
        if g and NT[i] == g:
            WHY_ADD[i].append(f"Needs {BOSSNAME[g]} to be defeated first (vanilla boss path)")
        else:
            src = [BYID[r]["n"] for r in ING[i] if NT[r] > BYID[r]["t"] and NT[r] == NT[i] and d["t"] >= BYID[r]["t"]]
            if src:
                WHY_ADD[i].append(f"Crafted from {', '.join(sorted(src))}, which now sits on the same path")

# Random loot (structure chests, Suspicious Bags, archaeology, ordinary mob drops) can turn up from the very
# start, so it sits on Path 0 however low the chance; only drops tied to a boss are placed by that boss's strength.
RNG_WHY = re.compile(r"^(drop chance only|random drop only|low drop chance|chest-only, down to luck)", re.I)
RNG = set()
for d in D:
    i = d["id"]
    _src = re.split(r" · per mod page", d["src"] if isinstance(d["src"], str) else " ".join(d["src"]))[0]
    if re.search(r"\b(Apostle|Gundalf|Sniffer|Trial Guardian|Virtue|Gob|Bringer of Doom|Shadow Wizard)\b", _src):
        continue
    _chest = re.match(r"(chest:|Suspicious Bag|archaeology:)", _src) and not re.search(r"\bbag: |drop \(", _src)
    if d["g"] == "Loot" and NT[i] > 0 and NT[i] == d["t"] and not GATE[i] and (_chest or (d["why"] and all(RNG_WHY.match(w) for w in d["why"]))) \
            and not re.search(r"\b(bag|drop \(100%\))|Nether|Bastion|Piglin|End City", re.split(r" · per mod page", d["src"] if isinstance(d["src"], str) else " ".join(d["src"]))[0]):
        NT[i] = NA[i] = 0
        RNG.add(i)
        d["why"] = []
        WHY_ADD[i].append("Random loot: it can drop from the start, so it sits on Path 0 even though the chance is low")

# A recipe held back only by a random-loot ingredient follows that ingredient down to Path 0.
_EA = re.compile(r"^Earliest Act [IVX]+: .+? needs (.+?)(?: → (.*))?$")
for _ in range(3):
    for d in D:
        i = d["id"]
        if d["g"] != "Craft" or NT[i] <= 0 or NT[i] != d["t"] or GATE[i] or not d["why"] or i in RNG:
            continue
        ok, via = True, []
        for w in d["why"]:
            m = _EA.match(w)
            if m:
                dep = BYNAME.get(m.group(1).strip())
                if not dep or NT.get(dep, 9) != 0 or re.search(r"nether|end|chthonic", m.group(2) or "", re.I):
                    ok = False
                    break
                via.append(m.group(1).strip())
            elif not re.match(r"^(random drop only|low drop chance|chest-only)", w, re.I):
                ok = False
                break
        if ok and via:
            NT[i] = NA[i] = 0
            RNG.add(i)
            d["why"] = []
            WHY_ADD[i].append(f"Crafted from {', '.join(via)}, which can be had from the start (random loot, or crafted from it), so it sits on Path 0 too")

# Nether-only sources: the pack keeps the Nether locked until Eldorath falls (Path V), so random loot that only
# exists there, and recipes that need a Nether-only material, cannot sit before Path V.
NETHER = 5
# L2 Hostility trait drops (data/l2hostility/loot_modifiers in the jar, overridden by the pack's kubejs data):
# item -> lowest Looting Charm tier and the trait level it needs. A charm's own path is when that drop opens up;
# trait level 3+ mobs are uncommon that early, so those count only as "earliest with luck".
_L2F = pathlib.Path("/tmp/claude-0/-home-user-Linggango-Relic-Wiki/4288cb83-ead3-5324-91d4-51e578dc641c/scratchpad/extract/l2loot.json")
L2LOOT = json.loads(_L2F.read_text()) if _L2F.exists() else {}
CHARM = {k: BYID.get(f"l2hostility:charm_of_looting_{k}") for k in (1, 2, 3, 4)}
CHARM_T = {k: NT[v["id"]] if v else 99 for k, v in CHARM.items()}
L2NAME = {"Wither Skeleton Skull": "minecraft:wither_skeleton_skull", "Ghast Tear": "minecraft:ghast_tear",
          "Netherite Scrap": "minecraft:netherite_scrap", "Netherite Ingot": "minecraft:netherite_scrap"}
L2NAME = {k: v for k, v in L2NAME.items() if v in L2LOOT}
def L2PATH(mid, realistic):
    e = L2LOOT[mid]
    t = CHARM_T[e["tier"]]
    return t if (e["lv"] <= 1 or not realistic) else NETHER
def PLABEL(t):
    return {0: "Path 0", 1: "Path I", 2: "Path II", 3: "Path III", 4: "Path IV", 5: "Path V", 6: "Path VI", 6.1: "the Warden path",
            6.2: "the Wither path", 6.3: "the Ender Dragon path", 7: "Path VII", 8: "Path VIII", 9: "Path IX", 10: "Path X", 11: "Path XI"}.get(t, f"Path {t}")
def L2WHY_ONE(x, e):
    c = CHARM[e["tier"]]["n"] if CHARM[e["tier"]] else "a Looting Charm"
    lvl = "" if e["lv"] <= 1 else f" level {e['lv']}+"
    note = "" if e["lv"] <= 1 else " That trait level is rare early, so only the earliest path moves."
    return f"{x} also drops from{lvl} {e['trait'].replace('_', ' ')}-trait mobs while you wear the {c} (L2 Hostility), from {PLABEL(CHARM_T[e['tier']])} on.{note}"
def L2WHY(mats):
    parts = []
    for x in sorted(mats):
        e = L2LOOT[L2NAME[x]]
        c = CHARM[e["tier"]]["n"] if CHARM[e["tier"]] else "a Looting Charm"
        lvl = "" if e["lv"] <= 1 else f" level {e['lv']}+"
        parts.append(f"{x} also drops from{lvl} {e['trait'].replace('_', ' ')}-trait mobs while you wear the {c}")
    return "Nether material, but " + "; ".join(parts) + " (L2 Hostility). The earliest path counts that route; the usual path waits for the Nether when the trait level needed is rare early on"
_NMOB = re.compile(r"^(Blaze|Wither Skeleton|Ghast|Magma Cube|Piglin|Piglin Brute|Hoglin|Strider|Zombified Piglin) drop \([\d.]+%\)$")
_NCHEST = re.compile(r"^chest: (Bastion Remnant|Crimson Tower|Fortress|Nether Bridge|Soul Fortress|Piglin Ruin|Nether)\b")
_NING = re.compile(r"\b(Wither Skeleton Skull|Obsidian Rose|Netherite (Scrap|Ingot)|Shroomlight|Ghast Tear|Nether Wart|Warped Focus|Ancient Debris)\b")
_KEYN = re.compile(r"key item: .*\((Blaze|Wither Skeleton|Ghast|Magma Cube) drop\)|key item: .*\(chest: (Bastion Remnant|Crimson Tower|Fortress|Nether Bridge)")
for d in D:
    i = d["id"]
    src = d["src"] if isinstance(d["src"], str) else " ".join(d["src"])
    head = split_top(src, " · ")[0]
    why = None
    if d["g"] == "Loot" and (_NMOB.match(head) or _NCHEST.match(head)):
        why = "Only drops in the Nether, which stays locked until Eldorath falls"
    elif d["g"] == "Craft" and (_NING.search(head) or _KEYN.search(src)):
        why = "Needs a Nether-only material, and the Nether stays locked until Eldorath falls"
        # L2 Hostility: with a Looting Charm worn, trait mobs in the Overworld drop some Nether materials
        mats = {m.group(1) for m in _NING.finditer(head)}
        if mats and not _KEYN.search(src) and all(L2NAME.get(x) for x in mats):
            t_r = max(L2PATH(L2NAME[x], realistic=True) for x in mats)
            t_e = max(L2PATH(L2NAME[x], realistic=False) for x in mats)
            if t_e < NETHER and NT[i] < NETHER:
                NT[i] = max(NT[i], t_r); NA[i] = max(NA[i], t_e)
                RNG.discard(i)
                WHY_ADD[i] = [w for w in WHY_ADD[i] if "from the start" not in w] + [L2WHY(mats)]
                continue
    if why and NT[i] < NETHER:
        NT[i] = max(NT[i], NETHER); NA[i] = max(NA[i], NETHER)
        RNG.discard(i)
        WHY_ADD[i] = [w for w in WHY_ADD[i] if "from the start" not in w] + [why]
# Same idea for the pack's own "key item: X (Nether/End material)" notes and for the Shulker Shell gate:
# when the hardest ingredient is also an L2 trait drop, the path opens with that Looting Charm.
L2KEY = {"Ghast Tear": "minecraft:ghast_tear", "Netherite Scrap": "minecraft:netherite_scrap", "Netherite Ingot": "minecraft:netherite_scrap",
         "Wither Skeleton Skull": "minecraft:wither_skeleton_skull", "Shulker Shell": "minecraft:shulker_shell", "Blaze Rod": "minecraft:blaze_rod"}
for d in D:
    i = d["id"]
    src = d["src"] if isinstance(d["src"], str) else " ".join(d["src"])
    m = re.search(r"key item: ([^·(]+?) \((?:Nether|End) material\)", src)
    if d["g"] != "Craft" or not m or L2KEY.get(m.group(1).strip()) not in L2LOOT:
        continue
    x = m.group(1).strip(); e = L2LOOT[L2KEY[x]]
    if x == "Shulker Shell" and GATE[i] != DRAGON:
        continue
    if GATE[i] and x != "Shulker Shell":
        continue
    if x != "Shulker Shell" and NT[i] > NETHER:
        continue  # something later than the Nether holds it back anyway
    cp = CHARM_T[e["tier"]]
    floor = max([cp] + [NT[r] for r in ING[i]])
    if floor >= NT[i] and floor >= NA[i]:
        continue
    if e["lv"] <= 1:
        NT[i] = max(floor, min(NT[i], floor)); NA[i] = min(NA[i], NT[i])
    else:
        NA[i] = min(NA[i], floor)
    WHY_ADD[i].append(L2WHY_ONE(x, e))

# a recipe can never come earlier than any curio it is made from
for _ in range(6):
    for d in D:
        i = d["id"]
        hi = [r for r in ING[i] if NT[r] > NT[i]]
        if d["g"] == "Craft" and hi:
            top = max(NT[r] for r in hi)
            NT[i] = top; NA[i] = max(NA[i], top)
            RNG.discard(i)
            WHY_ADD[i] = [w for w in WHY_ADD[i] if "from the start" not in w] + [f"Crafted from {', '.join(sorted(BYID[r]['n'] for r in hi if NT[r] == top))}, which sits on a later path"]

# Drops of the same side boss share one path: the boss's own (the highest any of its drops was given).
BOSS_OF = {}
for d in D:
    m = re.match(r"^([A-Z][\w' ,]+?) drop \(\d", d["src"] if isinstance(d["src"], str) else "")
    if d["g"] == "Loot" and m and d["id"] not in RNG:
        BOSS_OF.setdefault(m.group(1), []).append(d["id"])
for boss, ids in BOSS_OF.items():
    if len(ids) > 1 and any(any("from boss" in w for w in BYID[i]["why"]) for i in ids):
        top = max(NT[i] for i in ids)
        for i in ids:
            if NT[i] < top:
                NT[i] = NA[i] = top
                WHY_ADD[i].append(f"Dropped by {boss}, a side boss placed by its strength on the same path as its other drops")

# Terramity scarce-material rule: Daemonium / Iridium are rare structure loot.
SCARCE_MATS = {k for k, v in NM.items() if v in ("Daemonium Chunk", "Daemonium", "Iridium Chunk", "Iridium Ingot")}
SCARCE_WHY = re.compile(r"Daemonium Ore|Better Gold Pickaxe|needs Daemonium Sewing Kit")
SCARCE = set()
for d in D:
    i = d["id"]
    if d["g"] != "Craft" or not (ingredients(d) & SCARCE_MATS):
        continue
    blocked = [w for w in d["why"] if not SCARCE_WHY.search(w) and not w.startswith("main ingredient is only guaranteed from boss Gob")]
    if NT[i] == d["t"] and d["a"] == 0 and NT[i] > 0 and not blocked and not GATE[i]:
        # Crystal Heart also needs an Iridescent Shard (Gob / Super Sniffer), so it is not a pure Path 0 recipe
        if any(BYNAME.get("Iridescent Shard") == c for c in ingredients(d)):
            continue
        NT[i] = 0
        WHY_ADD[i].append("Daemonium and Iridium can be looted from Terramity structures, so this is craftable on Path 0 with luck; rated one rarity higher for it")
    if NT[i] == 0:
        SCARCE.add(i)
# items crafted from a scarce Path 0 relic follow it down (e.g. Pincushion ← Daemonium Sewing Kit)
for d in D:
    i = d["id"]
    if d["g"] == "Craft" and NT[i] > 0 and not GATE[i]:
        sc_ing = ING[i] & SCARCE
        if sc_ing and all(w.startswith("Earliest Act") and any(BYID[s]["n"] in w for s in sc_ing) for w in d["why"]) and d["why"]:
            NT[i] = NA[i] = 0
            SCARCE.add(i)
            WHY_ADD[i].append(f"Follows {', '.join(BYID[s]['n'] for s in sc_ing)} down to Path 0 (Terramity scarce materials)")

# ---------------------------------------------------------------- 2. Rarity
PRIORITY = {d["id"] for d in D if re.fullmatch(r"celestial_artifacts:\w+_etching|l2hostility:charm_of_looting_\d", d["id"])}


def bucket(sc):
    return sum(sc >= x for x in TH)


R0 = {d["id"]: d["r"] for d in D}
for d in D:
    i = d["id"]
    d["sc"] = round(d["sc"] + 0.21 * (PV[NT[i]] - PV[d["t"]]), 3)
    d["ac"] = round(d["ac"] + (PV[NT[i]] - PV[d["t"]]), 2)
    r = d["r"] if NT[i] == d["t"] else bucket(d["sc"])
    if i in RNG:
        r = R0[i]
    if i in SCARCE:
        # rare structure loot: one step above what the path alone would give, never below the old rating
        r = min(5, max(R0[i], bucket(d["sc"]) + 1))
    d["br"] = r
# an upgrade can never be rarer than what it is made from
for _ in range(6):
    for d in D:
        ing = [BYID[r]["br"] for r in ING[d["id"]]]
        if ing and max(ing) > d["br"]:
            d["br"] = max(ing)
for d in D:
    d["r"] = MUST if d["id"] in PRIORITY else d["br"]
    d["t"], d["a"] = NT[d["id"]], NA[d["id"]]

# ---------------------------------------------------------------- 3. Plain English
def roman(n):
    return ROMAN.get(int(n), str(n))


def act2path(s):
    s = re.sub(r"\bAct (\d+)\b", lambda m: "Path " + roman(m.group(1)), s)
    s = re.sub(r"\bActs\b", "Paths", s)
    return re.sub(r"\bAct\b", "Path", s)


def cap(s):
    s = s.strip()
    return s[:1].upper() + s[1:] if s else s


def sent(s):
    s = cap(s)
    return s if not s or s[-1] in ".!?)" else s + "."


def words(key):
    key = key.replace("_", " ").replace("-", " ")
    key = re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", key)
    return re.sub(r"\s+", " ", key).strip()


def mob(v):
    v = v.strip().strip('"')
    if re.fullmatch(r"[a-z0-9_]+:[a-z0-9_/]+", v):
        return NM.get(v) or words(v.split(":")[1]).title()
    return v


def lootid(s):
    s = re.sub(r"\(_[a-z_]+\)\?", "", s)
    s = re.sub(r"\[[^\]]*\]\*", "", s)
    s = re.sub(r"\(([a-z_]+(?:/[a-z_]+)+)\)", lambda m: " / ".join(words(x).title() for x in m.group(1).split("/")), s)
    return re.sub(r"\b[a-z][a-z0-9_]*\b", lambda m: words(m.group(0)).title() if "_" in m.group(0) or m.group(0) in ("stronghold", "village") else m.group(0), s)


GATEKEEPER = {"Iron": "Iron Colossus", "Gold": "the Goblin Lord", "Emerald": "Arion", "Diamond": "Eldorath",
              "Netherite": "Zoranth the Forgotten", "Elvenite": "the Elvenite Paladin", "Voiderite": "Vaedric",
              "Cataclysm": "the Calamities", "Blood": "Sanghor", "Sun": "Zoranth Newborn"}
STATION = {
    "Crafting Table": "Craft at a Crafting Table from", "Smithing Table": "Upgrade at a Smithing Table with",
    "Tinkerer's Workshop": "Combine at a Tinkerer's Workshop:", "Workshop": "Make at the Terra Curio Workshop from",
    "Enchanting Apparatus": "Infuse in an Enchanting Apparatus (Ars Nouveau) with", "Ritual Goety": "Perform a Goety ritual with",
    "Ritual of the Forest": "Perform the Ritual of the Forest (Nature's Aura) with", "Upgrade Forge": "Upgrade at an Upgrade Forge with",
    "Hellfire Forge": "Forge at a Hellfire Forge (Blood Magic) with", "Alchemy Array": "Draw an Alchemy Array (Blood Magic) with",
    "Cursed Infuser": "Infuse at a Goety Cursed Infuser:", "Imbuement Chamber": "Imbue in an Imbuement Chamber (Ars Nouveau) with",
    "Natural Altar": "Infuse at a Natural Altar (Nature's Aura) with", "Offering Table": "Offer at an Offering Table (Nature's Aura):",
    "Blood Altar": "Infuse at a Blood Altar:", "Mixing Cauldron": "Brew in a Mixing Cauldron (Hexerei) with", "Anvil": "Combine on an Anvil:",
}


def andjoin(xs):
    xs = [x.strip() for x in xs if x.strip()]
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1] if xs else ""


def note_h(n):
    n = n.strip()
    m = re.fullmatch(r"bag: (.+?)(?: ([\d–.]+%?))?", n)
    if m:
        return f"from {m.group(1)}'s treasure bag" + (f" ({m.group(2)})" if m.group(2) else "")
    m = re.fullmatch(r"gated (\w+)", n)
    if m:
        k = GATEKEEPER.get(m.group(1))
        return f"locked behind the {m.group(1)} gate" + (f" until you defeat {k}" if k else "")
    m = re.fullmatch(r"mine (.+)", n)
    if m:
        return f"mined from {m.group(1)}"
    if n == "Nether material":
        return "found in the Nether"
    if n == "End material":
        return "found in the End"
    m = re.fullmatch(r"(.+?) drop(?: \((.+)\))?", n)
    if m and not m.group(1).startswith(("trait", "L2")):
        return f"dropped by {m.group(1)}" + (f" — {m.group(2)}" if m.group(2) else "")
    m = re.fullmatch(r"chest: (.+)", n)
    if m:
        return f"found in {m.group(1)} chests"
    if re.fullmatch(r"(Thermal|IE|Create|Alex's Mobs|Industrial|Mekanism)[\w' :]*", n):
        return f"made with a {n.replace('IE ', 'Immersive Engineering ')}"
    return n


def drop_h(seg):
    seg = re.sub(r" Additions New drop| Additions drop", " drop", seg)
    seg = re.sub(r"^Additional (.+?) Loot drop", r"\1 drop", seg)
    m = re.fullmatch(r"(.+?) drop(?: \(([^)]+)\)| ([\d.–]+%))?(.*)", seg)
    if m and not m.group(1).startswith(("L2 Hostility", "trait")):
        ch = m.group(2) or m.group(3)
        return f"Dropped by {m.group(1)}" + (f" ({ch})" if ch else "") + m.group(4)
    return None


def chest_h(seg):
    m = re.fullmatch(r"chest: (.+?)(?: \(\+(\d+) more\))?(?: \(up to ([\d.]+)%/chest\))?", seg)
    if not m:
        return None
    place, more, up = m.groups()
    m2 = re.fullmatch(r"(.+?) \(?([\d.]+)%(?:/chest)?\)?", place)
    if m2 and not more:
        return f"Found in {m2.group(1)} chests ({m2.group(2)}% per chest)"
    places = andjoin(place.split(", ")) if not more else place + f" and {more} more places"
    return f"Found in chests at {places}" + (f", up to {up}% per chest" if up else "")


ETCH = {
    "celestial_artifacts:end_etching": "75% chance from the Warden if you kill it while carrying 9 or more status effects. You must wear the Catastrophe Scroll with the End curse active.",
    "celestial_artifacts:nihility_etching": "50% chance from the Warden if the killing blow is damage that ignores enchantments. You must wear the Catastrophe Scroll with the Nihility curse active.",
    "celestial_artifacts:life_etching": "15% chance from any mob with 500 or more max health; the Warden (500 HP) is the first reliable target. You must wear the Catastrophe Scroll with the Life curse active.",
    "celestial_artifacts:chaotic_etching": "30% chance when the Wither is killed by an explosion. You must wear the Catastrophe Scroll with the Chaotic curse active.",
    "celestial_artifacts:truth_etching": "50% chance when the Wither is killed by a raider (Pillager, Vindicator, Ravager…). You must wear the Catastrophe Scroll with the Truth curse active.",
    "celestial_artifacts:desire_etching": "25% chance when you kill the Wither with Looting VII or higher. You must wear the Catastrophe Scroll with the Desire curse active.",
    "celestial_artifacts:origin_etching": "50% chance when the Ender Dragon dies at Y 200 or higher. You must wear the Catastrophe Scroll with the Origin curse active.",
}
L2SET = re.compile(r"^L2 Hostility mobs level ≥100 with ≥100 HP drop tier 1")


LOOT_NAME = {
    "end_city_treasure": "End City",
    "mountain_tower/pyromancer_tower": "Mountain Tower and Pyromancer Tower", "underwater_ruin_small/big": "Underwater Ruin (small and big)",
    "chest/ice_dragon_female_cave/male_cave/roost": "Ice Dragon cave and roost",
}


def lootseg(seg):
    m = re.fullmatch(r"(.+?) \(([\d.]+)%/chest\)", seg)
    if not m or not re.search(r"[_/]", m.group(1)) or seg.startswith("chest: "):
        return None
    if m.group(1) == "ancient_city(_ice_box)?":
        return f"Found in Ancient City chests, ice box included ({m.group(2)}% per chest)"
    raw = re.sub(r"\[[^\]]*\]\*|\(_[a-z_]+\)\?", "", m.group(1)).replace("(", "").replace(")", "")
    name = LOOT_NAME.get(raw) or words(raw.replace("/", " / ")).title()
    return f"Found in {name} chests ({m.group(2)}% per chest)"


def seg_h(seg):
    seg = seg.strip()
    if not seg:
        return ""
    r = lootseg(seg)
    if r:
        return r
    m = re.fullmatch(r"trait L2 (\w+?)_drop_\w+", seg)
    if m:
        return f"Dropped by mobs with the L2 {words(m.group(1)).title()} trait (needs the matching Looting Charm)"
    r = chest_h(seg)
    if r:
        return r
    m = re.fullmatch(r"archaeology: (.+?) \(([\d.]+%)\)", seg)
    if m:
        return f"Brush suspicious blocks at {m.group(1)} ({m.group(2)})"
    m = re.fullmatch(r"bag: (.+?)(?: ([\d.–]+%?))?", seg)
    if m:
        return f"Comes from {m.group(1)}'s treasure bag" + (f" ({m.group(2)})" if m.group(2) else "")
    m = re.fullmatch(r"([A-Z][\w' ]+?)(?: \(([^)]*)\))?: (.+)", seg)
    if m and m.group(1) in STATION:
        st, q, ing = m.groups()
        lead = STATION[st]
        return f"{lead} {andjoin(split_top(ing, ', '))}"
    if seg.startswith("Accessory Box"):
        return "Can roll from an Accessory Box (Unique Accessories)" + seg[len("Accessory Box (Unique Accessories)"):]
    if seg.startswith("Suspicious Bag"):
        return "From a " + seg
    if seg.startswith("vanilla chests"):
        return "Found in vanilla chests " + seg[len("vanilla chests "):]
    if re.match(r"^[a-z_()?|\\\[\]\w/]+ \(", seg) and "_" in seg:
        return "Found in " + lootid(seg).replace("/chest)", " per chest)").replace("%/chest", "% per chest") + " chests"
    if seg == "inject entities goety obsidian monolith":
        return "Added to the Obsidian Monolith's loot (Goety)"
    r = drop_h(seg)
    if r:
        return r
    seg = seg.replace("(KubeJS)", "(custom Linggango recipe)")
    seg = re.sub(r"^craft: ", "Craft from ", seg)
    seg = re.sub(r"^craft \(([^)]+)\)", r"Craft (\1 path)", seg)
    seg = re.sub(r"^craft,? ", "Craft; ", seg)
    return seg


def src_h(d):
    s = d["src"]
    if d["id"] in ETCH:
        return [ETCH[d["id"]]]
    if L2SET.match(s):
        return ["Dropped by L2 Hostility mobs of level 100+ with at least 100 max health: tier 1 at 100 HP, tier 2 at 200 HP … tier 5 at 500 HP.",
                "Two pieces of the same tier merge into the next tier.",
                "Artifact Experience + a Resonant Feather rerolls a piece into a random set."]
    out = []
    parts = split_top(s, " · ")
    head = parts[0]
    extra = []
    m = re.search(r"\. craftable from Act (\d+)$", head, re.I)
    if m:
        head = head[:m.start()]
        extra.append(f"Also craftable from Path {roman(m.group(1))}.")
    m = re.search(r"\. Craftable from Act (\d+)$", head)
    if m:
        head = head[:m.start()]
        extra.append(f"Also craftable from Path {roman(m.group(1))}.")
    alts = head.split(". Also: ")
    for k, a in enumerate(alts):
        segs = [seg_h(x) for x in split_top(a, "; ")]
        segs = list(dict.fromkeys(x for x in segs if x))
        line = "; ".join(segs[:1] + [cap(x) if False else x for x in segs[1:]])
        if k:
            line = "Also: " + line[:1].lower() + line[1:]
        out.append(sent(act2path(line)))
    for p in parts[1:]:
        m = re.match(r"key item: (.+?)(?: \((.*)\))?\s*$", p)
        if m:
            nm, note = m.groups()
            kid = name_id(nm, d["id"].split(":")[0])
            if nm.startswith("gated "):
                out.append(sent("Key requirement: " + note_h(nm)))
            elif kid in MAT:
                out.append(sent(f"Hardest ingredient: {nm} — comes from {BOSSNAME[MAT[kid]]} on this wiki's path ladder"))
            else:
                out.append(sent(f"Hardest ingredient: {nm}" + (f" — {note_h(note)}" if note else "")))
            continue
        m = re.match(r"per mod page \(([\d.]+)\): (.+)", p)
        if m:
            out.append(sent(f"The mod's own page ({m.group(1)}) says: {m.group(2)}"))
            continue
        m = re.match(r"trait item; needs an L2 mob of level ≥(\d+) to roll that trait", p)
        if m:
            out.append(f"Uses an L2 trait item; only mobs of level {m.group(1)}+ can roll that trait.")
            continue
        out.append(sent(act2path(p)))
    return out + extra


def why_h(w, d):
    w = act2path(w)
    w = re.sub(r"^Pack data: ", "", w)
    w = re.sub(r"^" + re.escape(d["n"]) + r" (needs|is)", lambda m: "Needs" if m.group(1) == "needs" else "It is", w)
    w = w.replace(" → ", "; ")
    w = re.sub(r"is in chest ([a-z_ ]+)", lambda m: "is found in " + ("Nether Fortress" if "nether bridge" in m.group(1) else lootid(m.group(1).strip()).title()) + " chests", w)
    w = re.sub(r"^It is gated behind (\w+)", r"Locked behind the \1 gate", w)
    w = re.sub(r"^drop chance only ([\d.]+%)", r"Only a \1 drop chance", w)
    w = re.sub(r"^random drop only, best chance ([\d.]+%): unlikely before the next Path", r"Random drop only (best chance \1), so you will probably not find it before the next Path", w)
    w = re.sub(r"^the recipe path without random chests needs", "Without lucky chest finds, the recipe needs", w)
    w = re.sub(r"^Earliest (Path [IVX0]+): ", r"Earliest at \1: ", w)
    w = re.sub(r"^needs farming L2 trait mobs", "Needs L2 trait mobs to be farmed (wear Curse of Envy)", w)
    w = re.sub(r"\(must mine ", "(you must mine ", w)
    w = re.sub(r"\(needs ", "(needs a ", w) if "(needs Better" in w else w
    return sent(w)


ATTR_ALIAS = {"Move Speed": "Movement Speed", "DODGE CHANCE": "Dodge Chance", "LETHALITY": "Lethality"}


def attr_name(n):
    n = n.strip()
    if n in ATTR_ALIAS:
        return ATTR_ALIAS[n]
    if n.isupper() or "_" in n:
        n = words(n).title().replace("Multiplier", "multiplier")
    elif re.search(r"[a-z][A-Z]", n):
        n = words(n)
    return n


def num(v):
    f = float(v)
    return str(int(f)) if f == int(f) else ("%g" % f)


def pct(v):
    return num(round(float(v) * 100, 4)) + "%"


def auto_h(s):
    m = re.fullmatch(r"(.+?) (×base|×total|[+−-])\s*(-?\d*\.?\d+)", s.strip())
    if not m:
        return s
    n, op, v = m.groups()
    n = attr_name(n)
    if op == "×base":
        return f"{'+' if float(v) >= 0 else ''}{pct(v)} {n}"
    if op == "×total":
        return f"{'+' if float(v) >= 0 else ''}{pct(v)} {n} (multiplies the final value)"
    sign = "-" if op in "−-" else "+"
    return f"{sign}{num(v)} {n}"


GENERIC = {"balance options", "generic config", "attributes", "artifacts", "accessories", "charm", "config", "common", "settings", "general", "items", "item"}
CHANCE = re.compile(r"chance|probability", re.I)


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def cfg_h(s, d):
    s = re.sub(r"^default gamerule (.+)$", r"\1 (default gamerule)", s.strip())
    s = re.sub(r"(\d) s \(default gamerule\)$", r"\1s (default gamerule)", s)
    m = re.fullmatch(r"(.+?) = (.+?)(?: \(([\w.-]+\.toml|default gamerule)\))?", s.strip())
    if not m:
        return None
    key, val, fil = m.groups()
    slug = d["id"].split(":")[1].split("/")[-1]
    iname = norm(d["n"])
    parts = key.split(".")
    if len(parts) == 2 and parts[0] == "chances":
        rest = parts[1][len(slug) + 1:] if parts[1].startswith(slug + "_") else parts[1]
        try:
            return f"Drop chance from {words(rest).title()}: {pct(val)}"
        except ValueError:
            return None
    if len(parts) >= 3 and parts[0] == "loot" and parts[1] == "chances":
        rest = parts[2]
        place = rest[len(slug) + 1:] if rest.startswith(slug + "_") else rest
        try:
            return f"Chest chance in {words(place).title()}: {pct(val)}"
        except ValueError:
            return None
    keep = []
    for p in parts:
        q = norm(p)
        if p.strip().lower() in GENERIC or q == iname or q == norm(slug) or not q:
            continue
        p2 = p
        if iname and q.startswith(iname) and len(q) > len(iname):
            # CharmofHellBladeArmorDebuff -> ArmorDebuff
            k, acc = 0, ""
            for ch in p:
                acc += ch
                if norm(acc) == iname:
                    p2 = p[len(acc):]
                    break
        if norm(p2).startswith(norm(slug)) and len(norm(p2)) > len(norm(slug)):
            p2 = p2[len(slug):] if p2.lower().startswith(slug) else p2
        keep.append(p2)
    if not keep:
        keep = [parts[-1]]
    label = words(keep[-1])
    label = re.sub(r"\bId\b", "", label).strip()
    label = re.sub(r"^[Dd]o [Gg]rant ", "Grants ", label)
    label = re.sub(r"^tier(\d)", r"Tier \1", label, flags=re.I)
    ctx = [re.sub(r"^tier(\d+)$", r"Tier \1", words(x), flags=re.I) for x in keep[:-1]]
    v = val.strip().strip('"')
    if re.fullmatch(r"-?\d\.\d+E\d+", v) and abs(float(v)) > 1e12:
        v = "unlimited"
    elif v.lower() in ("true", "false"):
        v = "yes" if v.lower() == "true" else "no"
    elif re.fullmatch(r"[a-z0-9_]+:[a-z0-9_/]+", v):
        v = mob(v)
    elif re.fullmatch(r"-?\d*\.?\d+", v):
        if CHANCE.search(label) and 0 < abs(float(v)) <= 1:
            v = pct(v)
        else:
            v = num(v)
    elif re.fullmatch(r"[a-z_]+|[A-Z_]+", v):
        v = words(v.lower()).title()
    elif v in ("true", "false"):
        v = "yes" if v == "true" else "no"
    lab = cap(label.lower()) if label.isupper() or label.islower() else cap(label[:1] + label[1:].lower())
    out = f"{lab}: {v}"
    if ctx:
        out = f"{' › '.join(cap(c) for c in ctx)} — {out}"
    if fil == "default gamerule":
        out += " (game-rule default)"
    return out


def setbonus_h(s):
    m = re.fullmatch(r"Set-bonus parameters \(base \+ per tier 1–5\): (.+)", s)
    if not m:
        return None
    out = []
    for kv in m.group(1).split(", "):
        k, _, v = kv.partition(": ")
        mm = re.fullmatch(r"(-?[\d.]+)\+(-?[\d.]+)/tier", v)
        pc = re.match(r"^(\d)_(.+)", k)
        lab = (f"{pc.group(1)}-piece {words(pc.group(2))}" if pc else words(k))
        if mm:
            b, step = mm.groups()
            out.append(f"{cap(lab)} {num(b)}" + (f" (+{num(step)} per tier)" if float(step) else ""))
        else:
            out.append(f"{cap(lab)} {v}")
    return "Set bonus, scaling with tier 1–5: " + "; ".join(out)


def stat_h(tag, s, d):
    s0 = s
    if tag == "tooltip":
        s = re.sub(r"^\s*[-•]\s*", "", s).strip()
        s = re.sub(r"%(?:\.\d)?[fdsi]", "…", s).replace("%%", "%")
        return re.sub(r"(?<=[+\-×x ])\?(?=[%m ]|$)|(?<=\+)\?", "…", s)
    if tag == "auto":
        s = re.sub(r" \(ModGameRules\.[A-Z_]+\.get\)", " (duration set by a game rule)", s)
        s = re.sub(r"^f_19594_ \w+\.getOmenAmount \((\d+)s\)$", r"Bad Omen (\1 s)", s)
        return auto_h(s)
    if tag in ("pack", "code"):
        m = re.fullmatch(r"([a-z_]+) = ([a-z_]+)", s.strip())
        if m:
            return f"Linked effect ({words(m.group(1)).title()}): {words(m.group(2)).title()}"
        r = setbonus_h(s) or cfg_h(s, d)
        if r:
            return r
        if tag == "pack" and re.fullmatch(r"[a-z_]+ = [a-z_]+", s):
            k, v = s.split(" = ")
            return f"Linked effect: {words(v).title()}"
    return act2path(s0)


changes = []
for d in D:
    i = d["id"]
    d["src0"] = d["src"]
    d["src"] = src_h(d)
    d["why"] = [why_h(w, d) for w in d["why"]] + [sent(w) for w in WHY_ADD[i]]
    d["fx"] = act2path(d["fx"])
    raw = []
    new = []
    for tag, s in zip(d["tg"], d["st"]):
        h = stat_h(tag, s, d)
        new.append(h)
        raw.append(s if h != s and tag in ("pack", "code", "auto") else 0)
    seen, keep = set(), []
    for k, h in enumerate(new):
        key = (d["tg"][k] in ("pack", "code", "auto"), h.lower())
        if key in seen:
            continue
        seen.add(key)
        keep.append(k)
    d["st"] = [new[k] for k in keep]
    d["tg"] = [d["tg"][k] for k in keep]
    raw = [raw[k] for k in keep]
    d["sr"] = raw if any(raw) else []
    d["pr"] = 1 if i in PRIORITY else 0
    d["sca"] = 1 if i in SCARCE else 0
    if d.get("gk", 0) is None:
        del d["gk"]
    if not d.get("gr"):
        d.pop("gr", None)
    old = BYID[i]

# changes.csv (old values come from a fresh load)
OLD = {d["id"]: d for d in load()["D"]}


def pl(k):
    return {-1: "L2 Artifacts", WARDEN: "Warden", WITHER: "Wither", DRAGON: "Ender Dragon"}.get(k, "Path " + ROMAN.get(int(k), str(k)) if k != 0 else "Path 0–I")


RN = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Must-Have ★"]
with open(ROOT / "build" / "changes.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "name", "mod", "path_old", "path_new", "earliest_old", "earliest_new", "rarity_old", "rarity_new", "base_rarity", "reason"])
    for d in D:
        o = OLD[d["id"]]
        if (o["t"], o["a"], o["r"]) != (d["t"], d["a"], d["r"]):
            w.writerow([d["id"], d["n"], d["m"], pl(o["t"]), pl(d["t"]), pl(o["a"]), pl(d["a"]), RN[o["r"]], RN[d["r"]], RN[d["br"]], " | ".join(WHY_ADD[d["id"]])])
            changes.append(d)

# ---------------------------------------------------------------- 4. Vanilla assets
VA = {}


def b64(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def box_faces(img, u, v, w, h, dd):
    """Minecraft box UV → front, top, right(side seen on the left), left."""
    return {"f": img.crop((u + dd, v + dd, u + dd + w, v + dd + h)), "t": img.crop((u + dd, v, u + dd + w, v + dd)),
            "r": img.crop((u, v + dd, u + dd, v + dd + h)), "l": img.crop((u + dd + w, v + dd, u + dd + w + dd, v + dd + h))}


war = Image.open(VAN / "entity_warden_warden.png").convert("RGBA")
for k, im in box_faces(war, 0, 32, 16, 16, 10).items():
    VA[f"warden_{k}"] = b64(im)
wit = Image.open(VAN / "entity_wither_wither.png").convert("RGBA")
for k, im in box_faces(wit, 0, 0, 8, 8, 8).items():
    VA[f"wither_{k}"] = b64(im)
for k, im in box_faces(wit, 32, 0, 6, 6, 6).items():
    VA[f"withers_{k}"] = b64(im)
drg = Image.open(VAN / "entity_enderdragon_dragon.png").convert("RGBA")
eyes = Image.open(VAN / "entity_enderdragon_dragon_eyes.png").convert("RGBA")
drg.alpha_composite(eyes)
for k, im in box_faces(drg, 112, 30, 16, 16, 16).items():
    VA[f"dragon_{k}"] = b64(im)
icons = Image.open(VAN / "gui_icons.png").convert("RGBA")
VA["gui_heart"] = b64(icons.crop((52, 0, 61, 9)))
VA["gui_armor"] = b64(icons.crop((34, 9, 43, 18)))
VA["gui_food"] = b64(icons.crop((52, 27, 61, 36)))
for p in sorted(VAN.glob("*.png")):
    n = p.stem
    if n.startswith(("mob_effect_", "particle_", "item_", "block_")) or n == "environment_end_sky":
        VA[n.replace("mob_effect_", "fx_").replace("particle_", "p_").replace("item_", "i_").replace("block_", "b_").replace("environment_", "")] = base64.b64encode(p.read_bytes()).decode()

# ---------------------------------------------------------------- 5. Pack-verified extras
EX = pathlib.Path("/tmp/claude-0/-home-user-Linggango-Relic-Wiki/4288cb83-ead3-5324-91d4-51e578dc641c/scratchpad/extract")
AN = {}
if (EX / "items/icons.json").exists():
    icj = json.loads((EX / "items/icons.json").read_text())
    for k, v in icj.items():
        # icons rendered from the pack's own models win over the old wiki's icons, which were sometimes
        # the wrong texture (an entity skin, a model UV sheet or another item's sprite)
        if v.get("png") and (k not in IC or v.get("kind") != "fallback-sprite"):
            IC[k] = v["png"]
        a = v.get("anim")
        if a and a.get("strip") and (k in BYID):
            AN[k] = [a["strip"], a.get("frames", 1), a.get("frametime_ms", 50)]
# in-game rarity from the server dump (name + colour as the game draws it)
VAN_RC = {"COMMON": "#FFFFFF", "UNCOMMON": "#FFFF55", "RARE": "#55FFFF", "EPIC": "#FF55FF"}
CONF = {"gray": "#828282", "white": "#FFFFFF", "blue": "#9696FF", "green": "#96FF96", "orange": "#FFC896", "light_red": "#FF9696", "pink": "#FF96FF",
        "light_purple": "#D2A0FF", "lime": "#96FF0A", "yellow": "#FFFF0A", "cyan": "#05C8FF", "red": "#FF2864", "purple": "#B428FF", "expert": "rainbow", "master": "#FF2864"}
CELC = {"red": "#FF5555", "green": "#55FF55", "gold": "#FFAA00", "yellow": "#FFFF55", "blue": "#5555FF", "pink": "#FF55FF", "dark_green": "#00AA00", "dark_purple": "#AA00AA", "dark_aqua": "#00AAAA"}
BRUT = {"LEGENDARY": "#FFCD14", "FABLED": "#C896FF", "MYTHIC": "#14CDFF", "DIVINE": "#FFFFAF", "GODLY": "rainbow", "CATACLYSMIC": "#4D8CDC", "STYGIAN": "#FF0000",
        "NOCTURNAL": "#5020C8", "PRISMATIC": "#B35FE9", "ICE": "#96DCF5", "SCULK": "#00F2FF", "DARK": "#5A5A5F", "FIRE": "#FF9600"}
OTH = {"legendary": "#FFAA00", "calamitous": "#FFAA00", "strange": "#FF55FF"}
dump = EX / "runtime/wiki_dump.json"
if dump.exists():
    DI = json.loads(dump.read_text())["items"]
    for d in D:
        it = DI.get(d["id"])
        if not it:
            continue
        r = it["r"]; ns = d["id"].split(":")[0]
        c = VAN_RC.get(r) or (CELC.get(r) if ns.startswith("celestial") else None) or BRUT.get(r) or OTH.get(r) or CONF.get(r) or "#FFFFFF"
        d["ig"] = [words(r.split(":")[-1].lower()).title(), c]
# Celestial Artifacts etchings: Chaotic and Truth have no Catastrophe Scroll condition (loot modifiers in the jar)
ETCH["celestial_artifacts:chaotic_etching"] = "30% chance when the Wither is killed by an explosion. No Catastrophe Scroll needed."
ETCH["celestial_artifacts:truth_etching"] = "50% chance when the Wither is killed by a raider (Pillager, Vindicator, Ravager…). No Catastrophe Scroll needed."
for d in D:
    if d["id"] in ETCH:
        d["src"] = [ETCH[d["id"]]]
# boss models and stats
B3 = {}
for f in sorted((EX / "bosses").glob("*.json")):
    if f.name in ("index.json", "package.json", "package-lock.json"):
        continue
    rec = json.loads(f.read_text())
    if rec.get("geo"):
        B3[rec["key"]] = rec
BST = json.loads((EX / "stats/bosses.json").read_text()) if (EX / "stats/bosses.json").exists() else {}
UI = {}
# Curios slot icons (the empty-slot silhouettes each mod registers), keyed by slot id
if (EX / "slots/slot_icons.json").exists():
    UI["cslot"] = json.loads((EX / "slots/slot_icons.json").read_text())
uim = json.loads((EX / "ui/assets.json").read_text()) if (EX / "ui/assets.json").exists() else {}
for key, name in (("logo", "lg/config/fancymenu/assets/linggango_menu/logo_menu.png"), ("bars", "gui/bars"), ("slots", "gui/container/inventory")):
    if name in uim:
        UI[key] = base64.b64encode((EX / "ui" / uim[name]["file"]).read_bytes()).decode()
if "lg/config/fancymenu/assets/default_background.png" in uim:
    im = Image.open(EX / "ui" / uim["lg/config/fancymenu/assets/default_background.png"]["file"]).convert("RGB")
    im = im.resize((2400, round(im.height * 2400 / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True, progressive=True)
    UI["bg"] = base64.b64encode(buf.getvalue()).decode()
TT = json.loads((EX / "tooltip/assets.json").read_text()) if (EX / "tooltip/assets.json").exists() else {}

# Drop what is not a relic: storage (backpacks, pouches, swap bags), items with no effect at all
# (vanity, plushies, "does nothing") unless something is crafted from them, and creative-only items.
STORAGE = re.compile(r"backpack|satchel|pouch|\bswap$|^(focus|brew|spellcaster) bag$|^deep learner$|terminal|warp index$|^ring of ender$", re.I)
NOFX = re.compile(r"^(vanity item|decorative|joke item[^;]*no stats|does absolutely nothing|no effect)", re.I)
def junk(d):
    if STORAGE.search(d["n"]) or (d["m"] in ("L2 Backpack", "Thermal") and re.search(r"quiver", d["n"], re.I)):
        return "storage"
    if re.search(r"creative only", " ".join(d.get("st") or []), re.I):
        return "creative-only"
    if NOFX.search(d.get("fx") or "") and not any(u in CURIO_IDS for u in d.get("uid", [])):
        return "no effect"
    return None
# Odd-sized sprites (14/15/17/19/26 px) get scaled by a non-integer factor and lose their pixel grid;
# pad them onto a 16 or 32 px canvas instead, centred, without resampling.
from PIL import Image as _Im
def _pad(b64):
    im = _Im.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    w, h = im.size
    # a 32 px texture whose drawing fits in 16 px (common in Wizard Terra Curios) would show at half the
    # size of its neighbours; cut it to a 16 px canvas so it is drawn at the same 2x as everything else
    bb = im.getbbox()
    if bb and (w, h) == (32, 32) and bb[2] - bb[0] <= 16 and bb[3] - bb[1] <= 16:
        im = im.crop(bb); w, h = im.size
    elif (w, h) in ((16, 16), (32, 32), (64, 64), (128, 128)) or max(w, h) > 32:
        return b64
    n = 16 if max(w, h) <= 16 else 32
    c = _Im.new("RGBA", (n, n)); c.paste(im, ((n - w) // 2, (n - h) // 2))
    out = io.BytesIO(); c.save(out, "PNG"); return base64.b64encode(out.getvalue()).decode()
for _k in list(IC):
    if not _k.startswith("v_"):
        try: IC[_k] = _pad(IC[_k])
        except Exception: pass
# fully transparent textures (the Ring of Invisibility is invisible in game too) get a marker in the UI
for d in D:
    try:
        if d["id"] in IC and not _Im.open(io.BytesIO(base64.b64decode(IC[d["id"]]))).convert("RGBA").getbbox():
            d["inv"] = 1
    except Exception:
        pass
CURIO_IDS = {d["id"] for d in D}
DROPPED = [(d["n"], d["m"], junk(d)) for d in D if junk(d)]
gone = {d["id"] for d in D if junk(d)}
D = [d for d in D if d["id"] not in gone]
for d in D:
    d["uid"] = [u for u in d.get("uid", []) if u not in gone]
print("dropped", len(DROPPED), DROPPED)
# config switches that leaked into stat lists ("Icon: yes", "Heaven icon: yes", raw spell tables) mean nothing to a player
for d in D:
    d["st"] = [x for x in d["st"] if not re.match(r"^\s*(\w+ )?icons?: (yes|no)\.?$|^Spell\b|^Mood change duration\b", x, re.I)]
IC = {k: v for k, v in IC.items() if not k.startswith("marrelics:")}
NM = {k: v for k, v in NM.items() if not k.startswith("marrelics:")} if isinstance(NM, dict) else NM
U = [u for u in U if not str(u.get("id", "")).startswith("marrelics:")] if isinstance(U, list) else U
OUT.mkdir(parents=True, exist_ok=True)
js = "const D=" + json.dumps(D, ensure_ascii=False, separators=(",", ":")) + ",IC=" + json.dumps(IC, separators=(",", ":")) + \
     ",NM=" + json.dumps(NM, ensure_ascii=False, separators=(",", ":")) + ",U=" + json.dumps(U, ensure_ascii=False, separators=(",", ":")) + ",VA=" + json.dumps(VA, separators=(",", ":")) + ",AN=" + json.dumps(AN, separators=(",", ":")) + \
     ",B3=" + json.dumps(B3, separators=(",", ":")) + ",BST=" + json.dumps(BST, ensure_ascii=False, separators=(",", ":")) + \
     ",UI=" + json.dumps(UI, separators=(",", ":")) + ",TT=" + json.dumps({k: v for k, v in TT.items() if "/overlay/" in k}, separators=(",", ":")) + ";"
(OUT / "data.js").write_text(js, encoding="utf-8")

# summary
from collections import Counter
print("relics", len(D), "changed", len(changes))
print("path moves", Counter((pl(OLD[d["id"]]["t"]), pl(d["t"])) for d in D if OLD[d["id"]]["t"] != d["t"]).most_common())
print("rarity", Counter(RN[d["r"]] for d in D))
print("must-have", sorted(BYID[i]["n"] for i in PRIORITY))
print("scarce", sorted(BYID[i]["n"] for i in SCARCE))
print("data.js", round(len(js) / 1e6, 2), "MB")
