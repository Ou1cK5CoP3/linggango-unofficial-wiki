"""Write src/data/SK.json: whether a second copy of each accessory adds to the first, read from the mods' bytecode."""
import json, pathlib, re, struct, sys, zipfile
from collections import defaultdict

INST = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r"D:\CurseForge\Instances\Linggango")
DATA = pathlib.Path(__file__).resolve().parent.parent / "src" / "data"

# operand bytes per opcode (tableswitch, lookupswitch and wide handled in code)
OPLEN = [0] * 256
for o in [0x10, 0x12, 0xa9, 0xbc] + list(range(0x15, 0x1a)) + list(range(0x36, 0x3b)):
    OPLEN[o] = 1
for o in [0x11, 0x13, 0x14, 0x84, 0xbb, 0xbd, 0xc0, 0xc1, 0xc6, 0xc7] + list(range(0x99, 0xa9)) + list(range(0xb2, 0xb9)):
    OPLEN[o] = 2
for o in [0xb9, 0xba, 0xc8, 0xc9]:
    OPLEN[o] = 4
OPLEN[0xc5] = 3
LOADS = {0x19: None, 0x2a: 0, 0x2b: 1, 0x2c: 2, 0x2d: 3}  # aload n


class Cls:
    """The parts of a class file this needs: constant pool, super, methods as (name, desc, static, [(op, arg)]), lambda targets."""

    def __init__(self, b):
        self.cp, i = [None], 10
        n = struct.unpack(">H", b[8:10])[0]
        while len(self.cp) < n:
            t = b[i]
            if t == 1:
                l = struct.unpack(">H", b[i + 1:i + 3])[0]
                self.cp.append(("u", b[i + 3:i + 3 + l].decode("utf-8", "replace")))
                i += 3 + l
            elif t in (3, 4):
                self.cp.append(("n", struct.unpack(">i" if t == 3 else ">f", b[i + 1:i + 5])[0])); i += 5
            elif t in (5, 6):
                self.cp += [("n", struct.unpack(">q" if t == 5 else ">d", b[i + 1:i + 9])[0]), None]; i += 9
            elif t in (7, 8, 16, 19, 20):
                self.cp.append((t, struct.unpack(">H", b[i + 1:i + 3])[0])); i += 3
            elif t == 15:
                self.cp.append((t, b[i + 1], struct.unpack(">H", b[i + 2:i + 4])[0])); i += 4
            else:
                self.cp.append((t,) + struct.unpack(">HH", b[i + 1:i + 5])); i += 5
        i += 2
        self.name, sup = self.cls(struct.unpack(">H", b[i:i + 2])[0]), struct.unpack(">H", b[i + 2:i + 4])[0]
        self.sup = self.cls(sup) if sup else None
        i += 4
        ni = struct.unpack(">H", b[i:i + 2])[0]; i += 2 + 2 * ni
        nf = struct.unpack(">H", b[i:i + 2])[0]; i += 2
        for _ in range(nf):  # fields
            i = self.skip_attrs(b, i + 6)
        nm_ = struct.unpack(">H", b[i:i + 2])[0]; i += 2
        self.methods = []
        for _ in range(nm_):
            acc, nm, ds, na = struct.unpack(">HHHH", b[i:i + 8]); i += 8
            code = []
            for _ in range(na):
                an, al = struct.unpack(">HI", b[i:i + 6])
                if self.utf(an) == "Code":
                    cl = struct.unpack(">I", b[i + 10:i + 14])[0]
                    code = self.decode(b[i + 14:i + 14 + cl])
                i += 6 + al
            self.methods.append((self.utf(nm), self.utf(ds), bool(acc & 8), code))
        self.bsm = []
        na_ = struct.unpack(">H", b[i:i + 2])[0]; i += 2
        for _ in range(na_):
            an, al = struct.unpack(">HI", b[i:i + 6])
            if self.utf(an) == "BootstrapMethods":
                j = i + 8
                for _ in range(struct.unpack(">H", b[i + 6:i + 8])[0]):
                    na = struct.unpack(">H", b[j + 2:j + 4])[0]
                    self.bsm.append(list(struct.unpack(f">{na}H", b[j + 4:j + 4 + 2 * na])))
                    j += 4 + 2 * na
            i += 6 + al

    def skip_attrs(self, b, i):
        n = struct.unpack(">H", b[i:i + 2])[0]; i += 2
        for _ in range(n):
            i += 6 + struct.unpack(">I", b[i + 2:i + 6])[0]
        return i

    def utf(self, k):
        return self.cp[k][1]

    def cls(self, k):
        return self.utf(self.cp[k][1])

    def ref(self, k):
        """(owner, name, desc) of a field or method ref, or the target of a MethodHandle."""
        e = self.cp[k]
        if e[0] == 15:
            return self.ref(e[2]) + (e[1],)
        nt = self.cp[e[2]]
        return self.cls(e[1]), self.utf(nt[1]), self.utf(nt[2])

    def decode(self, c):
        out, p = [], 0
        while p < len(c):
            op, q = c[p], p + 1
            if op in (0xaa, 0xab):
                q = (q + 3) & ~3
                if op == 0xaa:
                    lo, hi = struct.unpack(">ii", c[q + 4:q + 12]); q += 12 + 4 * (hi - lo + 1)
                else:
                    q += 8 + 8 * struct.unpack(">i", c[q + 4:q + 8])[0]
                out.append((op, None))
            elif op == 0xc4:
                q += 5 if c[q] == 0x84 else 3
                out.append((c[p + 1], struct.unpack(">H", c[p + 2:p + 4])[0]))
            else:
                n = OPLEN[op]
                arg = c[q] if n == 1 else struct.unpack(">H", c[q:q + 2])[0] if n >= 2 else None
                out.append((op, arg))
                q += n
            p = q
        return out

    def lam(self, idx):
        """Method handle (owner, name, desc, kind) an invokedynamic site points at, if it is a LambdaMetafactory call."""
        bi = self.cp[idx][1]
        args = self.bsm[bi] if bi < len(self.bsm) else []
        for a in args:
            if self.cp[a] and self.cp[a][0] == 15:
                r = self.ref(a)
                if not r[0].startswith("java/lang/invoke"):
                    return r
        return None


def mod_jars():
    """{modId: zip} for every jar in mods/ (a jar can hold several mods)."""
    out = {}
    for j in sorted(INST.glob("mods/*.jar")):
        try:
            z = zipfile.ZipFile(j)
            toml = z.read("META-INF/mods.toml").decode("utf-8", "replace")
        except (KeyError, zipfile.BadZipFile):
            continue
        for blk in re.split(r"(?m)^\s*\[\[", toml):
            m = re.match(r"mods\s*\]\][\s\S]*?^\s*modId\s*=\s*[\"']([^\"']+)", blk, re.M)
            if m:
                out.setdefault(m.group(1), z)
    return out


def classes(z):
    res = {}
    for n in z.namelist():
        if n.endswith(".class") and not n.startswith("META-INF"):
            try:
                c = Cls(z.read(n))
            except Exception:
                continue
            res[c.name] = c
    return res


def registrations(cs):
    """{registry name: (field "Owner.FIELD" or None, item class or None)} from register("name", ...) calls."""
    out = {}
    for c in cs.values():
        lams = {m[0]: m for m in c.methods}
        for name, desc, static, code in c.methods:
            last = None
            for k, (op, a) in enumerate(code):
                if op in (0x12, 0x13) and c.cp[a][0] == 8:
                    s = c.utf(c.cp[a][1])
                    if re.fullmatch(r"[a-z0-9_/.]+", s):
                        last = [s, None, None, k]
                elif last and k - last[3] > 40:
                    last = None
                elif last and op == 0xba and not last[2]:
                    r = c.lam(a)
                    if r and r[3] == 8:
                        last[2] = r[0]
                    elif r and r[0] == c.name and r[1] in lams:
                        last[2] = next((c.cls(x) for o, x in lams[r[1]][3] if o == 0xbb), None)
                elif last and op == 0xbb and not last[2]:
                    last[2] = c.cls(a)
                elif last and op == 0xb3:
                    o, f, d = c.ref(a)
                    out.setdefault(last[0], (f"{o}.{f}", last[2]))
                    last = None
    return out


def strs(c):
    if not hasattr(c, "_s"):
        c._s = {c.utf(e[1]) for e in c.cp if e and e[0] == 8}
    return c._s


def fallback(cs, ids, reg):
    """Item class for ids the register() scan missed: the one class naming the id, else a class named after it."""
    by_name = defaultdict(list)
    for c in cs.values():
        by_name[c.name.rsplit("/", 1)[-1].lower().replace("_", "")].append(c.name)
    for i in ids:
        if reg.get(i, (None, None))[1]:
            continue
        # a class naming this id but few of the others (registries, datagen and lang classes name them all)
        own = [c.name for c in cs.values() if i in strs(c) and len(strs(c) & ids) <= 3]
        hit = own[0] if len(own) == 1 else None
        k = i.replace("_", "")
        hit = hit or next(iter(by_name.get(k) or by_name.get(k + "item") or by_name.get("item" + k) or []), None)
        if hit:
            reg[i] = (reg.get(i, (None, None))[0], hit)


def ret(desc):
    return desc.rsplit(")", 1)[1]


def uuid_local(desc, static):
    """Local slot of the UUID parameter in a method descriptor, or None."""
    n = 0 if static else 1
    for m in re.finditer(r"\[*(?:L[^;]+;|[ZBCSIFJD])", desc[1:desc.index(")")]):
        if m.group(0) == "Ljava/util/UUID;":
            return n
        n += 2 if m.group(0) in ("J", "D") else 1
    return None


def after(c, code, k):
    """The next few instructions after k, invokes as their method name, others as their opcode."""
    return [c.ref(a)[1] if op in (0xb6, 0xb7, 0xb8, 0xb9) else op for op, a in code[k + 1:k + 7]]


def zero_test(nx):
    """A number used only as `> 0` / `== 0` (an on/off test)."""
    return bool(nx) and (nx[0] in range(0x99, 0x9f) or (nx[0] in (0x03, 0x04) and len(nx) > 1 and nx[1] in range(0x9f, 0xa5)))


def call_kind(owner, name, desc, nx):
    """'one' for an is-it-equipped lookup, 'n' for one whose result counts copies, else None. nx: after()."""
    if not re.search(r"curio|equip|wear|accessor|trinket|charm|ring|has[A-Z]|hasItem", name, re.I):
        return None
    if "curios/api" not in owner and not re.search(r"Lnet/minecraft/world/entity/(LivingEntity|player/Player|Entity);|ICuriosItemHandler", desc):
        return None
    r = ret(desc)
    if re.search(r"count|amount|number|total", name, re.I) and r in ("I", "F", "D", "J"):
        return "one" if zero_test(nx) else "n"
    if r in ("Ljava/util/List;", "Ljava/util/Collection;", "Ljava/util/Set;", "Ljava/util/stream/Stream;"):
        if nx[:1] in (["isEmpty"], ["findAny"], ["findFirst"], ["anyMatch"], ["get"]):
            return "one"
        if nx[:1] in (["size"], ["count"]):
            return "one" if zero_test(nx[1:]) else "n"
        return None  # loops over the copies: could go either way
    if r in ("Z", "Ljava/util/Optional;", "Lnet/minecraft/world/item/ItemStack;", "Ltop/theillusivec4/curios/api/SlotResult;"):
        return "one"
    return None


def evidence(cs, reg, every):
    """{id: Counter of evidence}: slot/fixed attribute modifiers, one-copy/count lookups, can't-equip-twice."""
    by_field, by_cls = defaultdict(set), defaultdict(set)
    for i, (f, k) in reg.items():
        if f:
            by_field[f].add(i)
        if k:
            by_cls[k].add(i)
    ev = defaultdict(lambda: defaultdict(int))

    def items_in(c, code, this):
        """Item ids each instruction refers to (field, own class, `this` in an item class, or a lambda that does)."""
        out = []
        for op, a in code:
            s = set()
            if op == 0xb2:
                o, f, d = c.ref(a)
                s = by_field.get(f"{o}.{f}", set())
            elif op in (0xc1, 0xc0, 0x12, 0x13) and c.cp[a] and c.cp[a][0] == 7:
                s = by_cls.get(c.cls(a), set()) if len(by_cls.get(c.cls(a), ())) == 1 else set()
            elif op == 0x2a and this:
                s = this
            elif op == 0xba:
                r = c.lam(a)
                if r and r[0] == c.name:
                    s = lam_items.get((c.name, r[1]), set())
            out.append(s)
        return out

    lam_items = {}
    for c in cs.values():  # what each lambda body refers to, for predicates handed to findFirstCurio
        this = by_cls.get(c.name, set())
        for name, desc, st, code in c.methods:
            if name.startswith("lambda$"):
                lam_items[(c.name, name)] = set().union(*items_in(c, code, set() if st else this)) if code else set()

    for c in cs.values():
        this = by_cls.get(c.name, set())
        for name, desc, st, code in c.methods:
            if not code:
                continue
            refs = items_in(c, code, set() if st else this)
            for k, (op, a) in enumerate(code):
                if op not in (0xb6, 0xb8, 0xb9):
                    continue
                o, n, d = c.ref(a)
                kind = call_kind(o, n, d, after(c, code, k))
                if not kind:
                    continue
                near = next((s for s in reversed(refs[max(0, k - 12):k]) if s), set())  # the call's own item argument
                for i in near:
                    ev[i][kind] += 1
                    ev[i][f"{kind}:{o.rsplit('/', 1)[-1]}.{n}"] += 1

    for k, ids in by_cls.items():  # attribute modifiers the item class or a parent builds, and duplicate refusal
        kinds, below = [], set()
        for c in chain(k, every):
            if c.name == k or not hooks(c) or hooks(c) & below:  # a parent builds modifiers from data only the item can supply
                kinds += modifiers(c)
            below |= {m[0] for m in c.methods}
        for lv in ("getFortuneLevel", "getLootingLevel"):  # Curios adds these up over every worn curio
            m = next((m for c in chain(k, every) for m in c.methods if m[0] == lv and m[3]), None)
            if m and m[3] != [(0x03, None), (0xac, None)]:
                kinds.append("n")
        for i in ids:
            for x in kinds:
                ev[i][x] += 1
            if unique(k, every):
                ev[i]["unique"] = 1
    return ev


def hooks(c):
    """Methods of its own that the class's curio getAttributeModifiers reads data from (this.x(...))."""
    m = next((m for m in c.methods if m[0] == "getAttributeModifiers" and "SlotContext" in m[1] and m[3]), None)
    return {r[1] for op, a in (m[3] if m else []) if op == 0xb6 for r in [c.ref(a)] if r[0] == c.name and "SlotContext" not in r[2]}


def modifiers(c):
    """"slot" or "fixed" per modifier the class builds (new AttributeModifier, addSlotModifier): is its UUID tied to the curio slot?"""
    out, fed = [], set()
    for name, desc, st, code in c.methods:  # lambdas and helpers handed the slot UUID by a curio method
        u = uuid_local(desc, st) if "SlotContext" in desc else None
        for k, (op, a) in enumerate(code if u is not None else []):
            r = c.lam(a) if op == 0xba else c.ref(a) if op in (0xb6, 0xb7, 0xb8) else None
            if r and r[0] == c.name and any((p == 0x19 and x == u) or LOADS.get(p) == u for p, x in code[max(0, k - 4):k]):
                fed.add(r[1])
    for name, desc, st, code in c.methods:
        if name == "<clinit>":
            continue
        u = uuid_local(desc, st) if "SlotContext" in desc or name in fed else None
        for k, (op, a) in enumerate(code):
            if op == 0xbb and c.cls(a).endswith("/AttributeModifier"):
                span = []
                for op2, a2 in code[k + 2:k + 14]:  # the UUID expression, up to the modifier's name
                    if op2 in (0x12, 0x13) and c.cp[a2][0] == 8 or op2 == 0xb7:
                        break
                    span.append((op2, a2))
            elif op in (0xb6, 0xb8, 0xb9) and c.ref(a)[1] == "addSlotModifier":  # Curios slot bonus: (map, slot id, uuid, amount, op)
                span = code[max(0, k - 10):k]
            else:
                continue
            slot = any((op2 == 0x19 and a2 == u) or (u is not None and LOADS.get(op2) == u) for op2, a2 in span) or any(
                op2 in (0xb6, 0xb8, 0xb9) and re.search(r"getSlotUuid|index|identifier|getIdentifier", c.ref(a2)[1]) for op2, a2 in span)
            out.append("slot" if slot else "fixed")
    return out


def chain(k, every):
    """The class and its parents, across every loaded jar."""
    c, seen = every.get(k), set()
    while c and c.name not in seen:
        seen.add(c.name)
        yield c
        c = every.get(c.sup)


def unique(k, every):
    """True when canEquip up the chain (following super calls) refuses a copy of itself (a lookup handed `this`)."""
    for c in chain(k, every):
        m = next((m for m in c.methods if m[0] == "canEquip" and m[3]), None)
        if not m:
            continue
        lams = {x[0]: x for x in c.methods}
        bodies = [m] + [lams[r[1]] for op, a in m[3] if op == 0xba for r in [c.lam(a)] if r and r[0] == c.name and r[1] in lams]
        for name, desc, static, code in bodies:
            for j, (op, a) in enumerate(code):
                if op in (0xb6, 0xb8, 0xb9) and j:
                    o, n, d = c.ref(a)
                    p, x = code[j - 1]
                    lam = c.lam(x) if p == 0xba else None
                    own = (p == 0x2a and not static) or (p in (0xb6, 0xb9) and c.ref(x)[1] == "m_41720_") or bool(
                        lam and lam[1] in lams and any(q in (0xb6, 0xb9) and c.ref(y)[1] == "m_41720_" for q, y in lams[lam[1]][3]))  # this, stack.getItem(), or a predicate on it
                    if own and (n == "findCurios" or call_kind(o, n, d, after(c, code, j))):
                        return True
        if not any(op == 0xb7 and c.ref(a)[1] == "canEquip" for op, a in m[3]):  # stop unless it defers to super.canEquip
            return False
    return False


def ladder(z, known):
    """linggango_tweaks AccessoryStacking: {id: [group, place among the known ids of its group (1 = best), exclusive]}; also the ids left out."""
    c = Cls(z.read("com/misanthropy/linggango/linggango_tweaks/tweak/balance/AccessoryStacking.class"))
    ns = {"terramity": "terramity", "terramityExclusive": "terramity", "confluence": "confluence", "brutalityExclusive": "brutality"}
    rows, s, g, r = [], None, None, None
    for op, a in next(m[3] for m in c.methods if m[0] == "<clinit>"):
        if op in (0x12, 0x13) and c.cp[a][0] == 8:
            s = c.utf(c.cp[a][1])
        elif op == 0xb2 and c.ref(a)[0].endswith("$Group"):
            g = c.ref(a)[1]
        elif op in (0x10, 0x11):
            r = a if op == 0x10 else struct.unpack(">h", struct.pack(">H", a))[0]
        elif op == 0xb8 and c.ref(a)[1] in ns:
            rows.append((f"{ns[c.ref(a)[1]]}:{s}", g.title(), r, c.ref(a)[1].endswith("Exclusive")))
    kept = [x for x in rows if x[0] in known]
    return {i: [g, 1 + sum(1 for j in kept if j[1] == g and j[2] > r), int(x)] for i, g, r, x in kept}, [x[0] for x in rows if x[0] not in known]


def factors():
    t = (INST / "config/linggango_tweaks-common.toml").read_text(encoding="utf-8")
    sec = t.split("[terramity_accessory_stacking]")[1].split("\n[")[0]
    return [float(re.search(rf"(?m)^\s*{k}\s*=\s*([\d.]+)", sec).group(1)) for k in ("second_factor", "third_factor")]


if __name__ == "__main__":
    D = json.loads((DATA / "D.json").read_text(encoding="utf-8"))
    need = defaultdict(set)
    for d in D:
        ns_, _, p = d["id"].partition(":")
        need[ns_].add(p)
    jars, loaded, every = mod_jars(), {}, {}
    for m in need:
        if m in jars and jars[m].filename not in loaded:
            loaded[jars[m].filename] = classes(jars[m])
            every.update(loaded[jars[m].filename])
    items, unknown = {}, []
    for m in sorted(need):
        if m not in jars:
            unknown += [f"{m}:{p}" for p in need[m]]
            continue
        cs = loaded[jars[m].filename]
        reg = registrations(cs)
        fallback(cs, need[m], reg)
        reg = {i: v for i, v in reg.items() if i in need[m]}
        ev = evidence(cs, reg, every)
        for p in sorted(need[m]):
            e = ev.get(p, {})
            y, n = e.get("slot", 0) + e.get("n", 0), e.get("fixed", 0) + e.get("one", 0)
            s = "u" if e.get("unique") else "p" if y and n else "y" if y else "n" if n else None
            if not s:
                unknown.append(f"{m}:{p}")
                continue
            # why: s = slot-tied bonus, f = fixed-ID bonus, c = counts copies, o = on/off check, u = refuses a second copy
            items[f"{m}:{p}"] = {"s": s, "w": "".join(k for k, v in (("u", e.get("unique")), ("s", e.get("slot")), ("c", e.get("n")),
                                                                     ("f", e.get("fixed")), ("o", e.get("one"))) if v)}
    lad, missing = ladder(jars["linggango_tweaks"], {d["id"] for d in D})
    for i, v in lad.items():
        items.setdefault(i, {})["l"] = v
    (DATA / "SK.json").write_text(json.dumps({"f": factors(), "i": items}, separators=(",", ":")), encoding="utf-8", newline="")
    from collections import Counter
    print(len(items), "accessories classified:", dict(Counter(v.get("s", "-") for v in items.values())), "ladder:", sum("l" in v for v in items.values()))
    print(len(unknown), "with no evidence either way, by mod:", dict(Counter(u.split(":")[0] for u in unknown).most_common()))
    print("ladder ids not in the wiki:", missing or "none")
