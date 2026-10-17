# Linggango Relic Wiki: overhaul notes (17 Oct 2026)

Output: `dist/Linggango_Relic_Wiki.html` (single file, works offline, 3.67 MB; the original was 3.27 MB).
The task prompt is in `PROMPT.md`; every path or rarity change is listed in `build/changes.csv`.

## Rebuild

```bash
python3 build/transform.py   # data: paths, rarity, plain-English text, vanilla textures → build/out/data.js
python3 build/build.py       # assemble dist/Linggango_Relic_Wiki.html
```

`original/` keeps the uploaded file untouched; `transform.py` always reads from it.

## What changed

### 1. Paths
- "Act" is now **"Path"** in the UI. Hash links (`#act/…`) and saved filters still work.
- Path `-1` is now **L2 Artifacts**. All 29 items in it are L2 Artifacts sets; they drop by L2 Hostility mob level, and the wiki still says so.
- Three vanilla-boss paths now sit between Path VI and VII: **Path VI (after Zoranth the Forgotten) → Warden → Wither → Ender Dragon → Path VII (after the Elvenite Paladin)**.
  Why this order: in the pack's own stats Zoranth hits for 20, the Wither for 32 with 20 armor, and the Paladin for 30 with 100 armor. The Ender Dragon is required before the Paladin, and the pack's Hardmode ×2.1 turns on after the Dragon and skips the Warden.
- Paths are rebuilt from dependencies. A relic moves up when it, or a relic it is crafted from, needs a Warden, Wither or Ender Dragon drop. That covers Warden Sclerite, Warden Soul, Warden Bone Shard, Nether Star, Pure Nether Star, Wither Force Field, the Dragon treasure bag, Shulker items, End City loot and "End material".
  Dragon's Breath and Echo Shard are **not** treated as gates: Dragon's Breath also drops from the L2 Gravity trait, and Echo Shards come from Ancient City chests.
- **116 relics changed path:** 55 → Ender Dragon, 27 → Wither, 24 → Warden, 10 → Path 0.

### 2. Rarity
- The embedded data has **no in-game rarity field**. The old `r` was a quantile of a score: ≈ 0.21 × Act + 0.41 × Power + gate bonus. The new rarity keeps that model, recomputed on the new paths, and adds:
  - **★ Must-Have** (new top tier, bright gold with a star) for the 7 Celestial Artifacts Etchings and the 4 L2 Hostility Looting Charms. They sort first in every path, list and mod page, and they pass every role filter ("every build"). Each one still shows its *base* power rarity.
  - **Terramity scarce rule:** relics made only from Daemonium Chunk / Daemonium / Iridium plus Path 0 materials move to Path 0 and rank one rarity above that path's usual level, never below their old rarity. That covers 10 moved relics (Crowbar, Dumbbell, Scope Goggles, Pincushion…) and 19 relics in total.
  - **Upgrade rule:** a relic is never rarer than any relic it is crafted from. Example: the old data had Empty Anklet as Rare while Emerald Anklet, which is made from it, was Common.
- **124 relics changed rarity, every change upward.** Distribution: Common 468, Uncommon 408, Rare 341, Epic 223, Legendary 147, Mythic 78, Must-Have 11.

### 3. Plain-English text, icons, visuals
- How-to-get, why-this-path and stat lines are rewritten as sentences. Config keys (`loot.chances.x = 0.03`), attribute modifiers (`DODGE_CHANCE ×base0.05`), loot-table ids (`ancient_city(_ice_box)?`), unresolved format codes (`%.1f%%`) and Minecraft colour codes (`§6`) no longer show. The numbers are unchanged. The original line is kept on each item page under **Raw pack data** (collapsed) and in the hover title of each stat's source badge.
- Vanilla 1.20.1 attribute/effect icons appear inline next to stats: Strength, Haste, Speed, Resistance, the heart, the armor icon, Luck, Fire Resistance, Poison, Wither…
- Path frames show a boss emblem. The vanilla bosses get **CSS 3D heads cut from the 1.20.1 entity textures** (the Wither has all three heads). The modded Keepers use their signature drop from the pack's icons. Each path frame also gets a block-texture backdrop (Sculk, Soul Sand, End Stone, Netherrack…).
- Relics and vanilla weapons float behind the page at three depths, with vanilla particle sprites (enchanting glyphs, glint, sparks). The hero has its own drifting layer, and the item page has orbiting particles.
- The tooltip now follows Legendary Tooltips (gradient border in the rarity colour, notched pixel corners, ornaments from Epic up) and Obscure Tooltips (rising particles from Epic up, shimmer for Mythic and Must-Have).
- The hub has two new sections, **★ Must-Have** and **Vanilla bosses on the Path**, and every path card shows its emblem.
- `prefers-reduced-motion` turns off all decorative motion. Phones have no horizontal scroll (checked at 390 px).

## Sources
- Vanilla boss numbers: [Minecraft Wiki: Warden](https://minecraft.wiki/w/Warden), [Wither](https://minecraft.wiki/w/Wither), [Ender Dragon](https://minecraft.wiki/w/Ender_Dragon). Warden 500 HP, melee 16/30/45; Wither 300 HP (Java), always drops a Nether Star; Ender Dragon 200 HP, 12,000 XP on the first kill.
- Textures: `InventivetalentDev/minecraft-assets` @ 1.20.1 (Mojang assets, used here for a fan wiki).
- Etching drop conditions, boss stats, Hardmode and gates: the pack data already embedded in the wiki.

## Labelled as inference, or not done
- 🔍 The Warden / Wither / Ender Dragon order is this wiki's recommendation; the pack does not gate those bosses. "End material" is treated as needing the Dragon, because the outer islands open only after it dies.
- 🔍 Life Etching drops from *any* mob with ≥ 500 max health. It is placed on the Warden path because the Warden is the first sure target.
- ❌ Linggango and Cisco's modpack assets (boss models, weapon textures, the pack's own tooltip resource packs) were not available: the session had no pack files, and CurseForge, Modrinth and Fandom were blocked. Only icons already in the wiki plus vanilla textures were used.
- ❌ The old "Mid & end game guide" (`#guide`) was already switched off in the original. Its text still says "Act" and has not been rewritten.
- The wiki text stays in English to match the in-game item names.

## v3 (pack files available)
- Data now comes from the real Linggango V6.6.5b4 files plus the 7 curio mods the user added (downloaded from CurseForge/Modrinth). A headless Forge 1.20.1 server with the pack dumped every item's **in-game rarity** (26,652 items) and every entity's base attributes (2,716).
- **In-game rarity** is shown next to the wiki tier, in the exact colour the game uses (vanilla, Brutality, Confluence, Celestial Core, Enigmatic Legacy, Lethality rarities read from the jars). 1,589 of 1,676 relics are verified; the rest say "Unverified" (MAR Relics, Ars Extensions, Fallen Traits, L2 Artifacts jars could not be loaded on the server).
- **Fix:** Chaotic and Truth Etching do not need the Catastrophe Scroll (their loot modifiers in celestial_artifacts-1.6.5.jar have no curio condition).
- **Boss stats** on each path page are the effective values the player faces: base attributes + the pack's HP bonus (armageddon_mod_config.toml) + Hardmode ×2.1 after the Ender Dragon (Warden excluded). Confirmed true from config: Hardmode follows the Ender Dragon and skips the Warden; the Dragon is needed before the Elvenite Paladin (Titan's Insigna needs Khyros's Tears from the Dragon bag); the Nether opens after Eldorath.
- **3D bosses:** the 14 Keepers' own GeckoLib models (Armageddon jar) and Bedrock models of the Warden, Wither and Ender Dragon, rendered with three.js. One shared WebGL renderer draws every on-screen stage through scissor viewports; tier headers use portraits rendered once in idle time.
- **Tooltip** reproduces Tooltip Overhaul as configured by Linggango: compact layout, palette by in-game rarity, notch corners, glint gradient, mod-name and rating footer, emerge animation.
- Hub uses Linggango's own title background and logo from its FancyMenu config. Animated item textures (.mcmeta) play on item pages and tooltips.
- Performance work (effects kept): icons are shared Blob URLs instead of inline base64 per tile, hover is handled once per animation frame without DOM sweeps, tile pop-ins only run for tiers entering the viewport, 3D stops when nothing is on screen. Long tasks after load fell from 10.2 s to about 2.7–5 s in this GPU-less container (software raster); real GPU frame times will be far lower but were not measurable here.
