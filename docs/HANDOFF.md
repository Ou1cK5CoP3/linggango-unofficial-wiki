# Linggango Wiki (base pack): handoff

A copy of tranquanghaofake-dotcom/Linggango-Relic-Wiki, cut down to **base** Linggango V6.6.5b4, with the lag and tearing fixed.
Upstream has no license. The user confirmed the owner's OK, and the site is now public.
- **Live site:** https://ou1ck5cop3.github.io/linggango-unofficial-wiki/ (GitHub Pages, `main` branch, root).
- **Hosting repo:** https://github.com/Ou1cK5CoP3/linggango-unofficial-wiki, git remote `site`.
- **To update:** rebuild, commit to `base-pack`, then `git push site base-pack:main`. `.nojekyll` makes Pages serve the files as they are.
Branch `base-pack`; the original upstream branch `claude/zen-pasteur-qi26dz` is untouched.

## Workflow
- `src/` is the source now: `shell.html`, `style.css`, `app.js`, `fx3d.js` (three.js bundle) and `data/*.json` (one file per data constant: `D` items, `IC` icons, `NM` names, `B3` boss models, `BST` boss stats…).
- `python tools/build.py` writes `index.html`. Open it directly in a browser; it's one self-contained file.
- `tools/split.py` was the one-time import from the upstream `index.html`; don't rerun it after editing `src/`.
- `tools/base_pack.py` applies the data changes below. It's safe to rerun because removals and moves are idempotent.
- `build/`, `dist/` and `original/` are the upstream's stale pipeline: `build/transform.py` reads the v1 data, and `build/out/` was never committed. Ignore them.
- Base instance (read only): `D:\CurseForge\Instances\Linggango`. Stage gates: `config/armageddon_mod_keeper_config.toml`.

## Changes (18 Oct 2026)
- **Mods:** removed 284 curios from 8 mods that aren't in the base pack (`wizard_terra_cuiros`, `celestial_artifacts`, `l2artifacts`, `ars_extensions`, `fallen_traits`, `calamitycurios`, `raccompat`, `ramcompat`). 1,611 → 1,327 curios. No remaining recipe used a removed item. The empty L2 path was dropped from `ORDER`.
- **Stages:** Path IX is labelled after **The Discord** (the Calamitous Keeper in the config). New **Path XII** after **Nyxaris** (Shadow Keeper) holds The Eclypse, Heart of Creation and Non-Euclidean Cube, which need drops from Nyxaris's treasure bag.
- **Recipe order:** a crafted curio is never on an earlier path than a curio it's made from. This moved Hate Sigil and Sin of Wrath VI → VII (Chthonic Cursemark), and Daemonium Whetstone 0 → II (Sharpening Stone).
- **Text:** hub, lede and footer no longer mention the added mods or Etchings. The empty "Recently added" block was removed.
- **Lag:** the perf block at the end of `style.css` stops the idle icon loops, the mass pop-in entrances, the Mythic spin border, the Must-Have star spin and the blurred background floaters. It also removes the header `backdrop-filter`. Hover motion is kept. Running animations with every tier on screen went from 1,891 to 4.
- **Scroll lag on The Path** (second fix): every tile icon had `will-change:transform`, which made 1,190 GPU layers, and drop-shadow `filter`s were on 3,437 elements. The block at the end of `style.css` removes both:
  - The slot and role badges use a plain backing or outline instead of 4 stacked drop-shadows.
  - Only Must-Have icons keep their glow.
  - `.tier` has `content-visibility:auto`, so off-screen paths skip rendering. Result: GPU layers 1,205 → 0 and filters 3,437 → 166.
- **Hover lag on The Path** (third fix). These were measured in the in-app Chromium (same engine as Opera GX, Chrome and Edge). The fixes are plain CSS and DOM changes, so they help every browser.
  - Before, hovering one tile restyled every sibling in its row: about 8–16 ms in Path 0-I, which has 632 tiles. The trigger was the hover/active `transform` switching on from `none`. Every tile now rests at `transform:translateY(0)`, and hover lifts it 2 px with no scale. Active-tile cost is down to about 0.02–3 ms.
  - The hover ring spun by animating a custom property (`--ang`), which repaints on the main thread every frame. It's now static. The blurred hover glow and the box-shadow transition are gone too.
  - `showTip` no longer forces a full layout (`void tip.offsetWidth`) to restart the entrance animation. The entrance now plays only when the tooltip first opens.
  - Removed the timer that swept a shimmer over random visible relics every 700 ms, so the page now goes idle.
  - Result: a mouse pass over 12 tiles went from about 12 long frames (50–120 ms) to 1.
- **Hover lag on The Path** (fourth fix, replaces part of the third). Fast mouse moves over relics still lagged on the live site. The real cost was repaints, not the hover itself: every tile drew its rarity ring and its slot/class badges with CSS masks (2,137 in Path 0–I alone), and each mask is an offscreen pass on every repaint. A tooltip change cost about 500 ms.
  - Rings are now plain 1.5–2 px borders in the rarity colour. The spin ring and shimmer draw only on the hovered tile.
  - Slot badges are images. `tools/tint_icons.py` bakes cream-tinted copies of the `cslot` icons into `UI.json` as `cslotT`; rerun it if `cslot` changes. `slotIcon(name,1)` returns the tinted one.
  - The third fix's resting `transform:translateY(0)` on every tile made each one its own paint layer; it's reversed. Hover lifts with `top:-2px` instead.
  - Tooltips open after the pointer rests 80 ms on a tile (hover intent), so a fast sweep builds none. `decorate()` now only scans the tooltip, not the whole page.
  - Result: masks on the whole page 2,137+ → 2, tooltip update about 500 ms → 12 ms.
- **Hover lag, fifth fix** (19 Oct 2026). The aim was hover feedback on the next frame.
  - **No 80 ms wait.** `mouseover` queues one `requestAnimationFrame`, which shows the tooltip for whatever tile is under the pointer at that moment. That gives at most one tooltip update per frame, and a fast sweep never queues stale work.
  - **Tooltips are built once per curio**, cached in `TIPC` and swapped in with `replaceChildren`.
  - **Tooltip effects removed:** no mask on the frame (now a plain border), no clip-path corners, no blurred shadow, no filters, no looping or entrance animations, and no 180 ms slide (it snaps to position).
  - **Hovered tile has no lift.** Changing a tile's `top`, `transform` or `z-index` cost 4–8 ms each, because tiles are positioned elements and the browser re-sorts the stacking order of every sibling (632 in Path 0–I). Hover is now outline plus inner glow, about 0.6 ms. The spin ring, bob and shimmer on the hovered tile are gone too.
  - **Result:** a cached tooltip swap went from 13–18 ms to about 7 ms; what's left is the tooltip's own text layout. A real-mouse sweep over 6 tiles right after load went from 5 long frames (52–96 ms) to none.
  - **Measuring pitfall:** a test rule that loses to an existing `!important` makes an expensive property look cheap. Check the computed value before trusting a number.
- **Ring-locked badge** (19 Oct 2026). 43 curios whose own text says they need the Ring of the Seven Curses (25) or the Ring of the Seven Virtues (18) get a corner badge: the ring's icon with a lock, red for Curses and gold for Virtues. Tooltips and item pages add a "Requires the Ring of the Seven …" line, and the legend explains the badge.
  - Detection is `RQRX` in `app.js`, which sets `d.rq`. It deliberately ignores the upstream `l:Seven Curses` tag, because that tag also covers items that only mention curses (L2 Hostility curse slots, Chthonic items).
  - The badge uses no masks, filters or transforms, so the hover fix above still holds.
- **Recipe in tooltips** (19 Oct 2026). The 846 curios with a structured recipe (`d.gr`) show a mini crafting grid, an arrow and the result in the tooltip (`tipRecipe`). This replaces the "Craft at … from …" text line. Lines that aren't the recipe, such as "Key requirement: …", stay as text. Curios without `d.gr` keep their text.
- **Tearing:** live 3D bosses were drawn on one fixed full-screen WebGL canvas that redraws a frame behind scroll. They're now static snapshots (`Boss3D.snapshot`), so there's no WebGL loop and no drag-to-rotate.
- **Phone layout:** path hero stacks below 640 px. The boss card used to be clipped off-screen.

## New pages (18 Oct 2026, second pass)
Code lives in `src/features.js` and `src/features.css`. `build.py` puts `features.js` *before* `app.js` because app.js renders on load, and appends `features.css` after `style.css`. Nav: Mods · Builder · Bosses · Mechanics.
- **`#build` loadout planner.** Pick your furthest Path, then fill slots. Slot caps start from the base pack's player slots (`SLOT_BASE`) and rise with curios that grant slots (`slotAdds` parses the stat text). Curios from a later Path, or past the cap, are flagged red.
  - Stat totals add up the "+N Stat" lines (`statsOf`). The effects list shows every equipped curio's text.
  - Class presets (Melee, Ranged, Mage…) take slot-adders first, then Must-Haves and role curios by score.
  - Share link: `#build/<path>/<Slot>=id,id|<Slot>=…`. Copy link copies it.
- **`#bosses` and `#boss/<key>`.** The Keepers in fight order, plus the vanilla bosses where they sit on the path. Each page has HP, armor and damage, how to summon it, notes, phase stats, the side bosses to farm first (`BOSSR`), the curios it unlocks, and prev/next links.
- **`#mechanics`.** The upstream's disabled `guide()` page, retitled, with "Act" changed to "Path".
- **Recipe tree.** It appears on any item page where an ingredient is itself a crafted curio (325 items).
- **Header overlap fix.** `.top{z-index:30}` at the end of `style.css`. The hero used to paint over the sticky header.

## Search and filters (18 Oct 2026, fourth pass)
- **Filter bar.** It sits on The Path, every path page (`#act/…`, including Path 0–I), slot pages and mod pages. It has a search box, a field picker with suggestions, a "How it works" hint and removable pills. Code: `fbar()`/`fbind()` in `features.js`.
- **Field search.** Both the bar and the header box accept free words plus `mod:`, `slot:`, `stat:`, `effect:`, `source:`, `path:`, `rarity:`, `role:`, `type:`, `tag:` and `name:`.
  - The same field twice means either one. Different fields must all match. `-` excludes, and quotes wrap spaces.
  - `mod:` also matches the frame family, so `mod:relic` finds the Relic-style mods. `path:` takes `ix`, `9`, `0` or `dragon`.
  - Parsing and matching live in `parseQ`/`qMatch`. Per-item search strings are cached in `d._q`.
- **Filters on list pages.** Path, slot and mod pages used to ignore the sidebar filters. They now apply them and say how many curios are hidden. A filter change re-renders the current page in place (`SOFT`): no jump to The Path, no scroll-to-top, no entrance animation.
- **The Path while filtering.** Empty paths are hidden, and there's a "no curios match" message.
- **Typing is debounced** (220 ms). The sidebar index only rebuilds when the filtered set changes (98 → 6.5 ms per update).
- **Text fixes:**
  - The hub now says "to Path XII".
  - Mods show "curios" (plural).
  - The item breadcrumb starts "Home /".
  - Path boss cards say "Hardmode stats (×2.1 HP and damage)" instead of the raw config note.
  - Mechanics: Path VIII's Keeper is The Discord, and Path XI's Keeper (Nyxaris) opens Path XII.
  - Slot pages for Living Armour, Blasphemy and Sacrament note that players start with none of that slot.
- **Fresh test fixes (same day):**
  - Free words and text fields now match from the start of a word (`qHas`). Before, "ring" also matched "triggering" and "string".
  - Re-focusing the search box after a re-render no longer scrolls the page.
  - On phones the header nav wraps to two rows. It used to push the page 29 px wider than the screen.
- **Still slow:** going back to The Path takes a few hundred ms, from rendering 1,327 tiles plus the boss emblem snapshots. This was already the case before.

## Relic levels and evolutions (19 Oct 2026)
- **Scope:** only Relics and More Relics items level up (49 curios). No other mod in the pack has per-item progression.
- **Data:** `python -I tools/relic_levels.py [instance]` writes `src/data/RL.json`. It needs a JDK (`javap`) and reads:
  - `config/relics/relics/*.yaml` and `config/morerelics/relics/*.yaml` from the instance, for ranges, modifiers, thresholds and costs;
  - the `en_us.json` lang files inside both jars, for ability and stat names and formats;
  - each relic class's `formatValue` lambda, read from the jar bytecode and turned into a small stack program (`p`) that the site runs in `rlFmt`.
  - Rerun it after a pack update, then rebuild. It prints any lambda it can't translate; right now there are none.
- **Game rules, checked in the bytecode (`IRelicItem`):**
  - Value = ADD x + y·z, MULTIPLY_BASE x + x·y·z, MULTIPLY_TOTAL x·(y+1)^z, where x is the rolled base, y is `upgradeModifier` and z is the ability level. The result is clamped to `min/maxThresholdValue` and rounded to 5 places.
  - Display uses `formatValue`. Doubles print like Java (`7.0`), and Java's `Math.round` rounds half up.
  - `addLevel` gives 1 point per relic level. An ability unlocks at `requiredLevel` and costs `requiredPoints` per level.
  - An ability with no stats can't be upgraded. `maxLevel: -1` means relic max ÷ `requiredPoints`.
  - Slot relics (Drowned, Hunter and Leather Belt) grant `Math.round(value)` slots.
  - Relic XP to reach level L is the sum over i < L of (initialCost + step·i).
- **Star rating (roll quality):**
  - Quality is 0–10, shown as 0–5 stars in half steps (`getMaxQuality` = 10).
  - A stat's quality is `round((f(base) − f(lo)) / ((f(hi) − f(lo)) / 10))`, clamped, where f is its `formatValue`. A fixed stat (lo = hi) is always 10, and for cooldowns (lo > hi) the low value earns 5 ★.
  - An ability's quality is the average of its stats', truncated. The relic's quality averages its abilities, truncated, and skips abilities whose config `maxLevel` is 0 (`nq` in RL.json). Abilities with no stats still count as 0, so Converging Orb, Depleted Spool, the Slumbering and Whispering Amulets, and Tyrant Mask can't reach 5 ★. That's the mod's own math.
  - The value for a star choice is `getStatByQuality`: lo + (hi − lo)/10·q. Coarse stats (whole slots) can only show some ratings, so pickers list only reachable ones (`rlQMap`, `rlSnap`). Arrow Quiver slots, for example, only show 0, 1.5, 3.5 and 5 ★.
  - UI: a per-stat star picker, a "Roll quality" set-all picker, and the relic's star rating. A "Stars" picker next to the relic-level slider on The Path sets tooltips (`st.rq`). Builder share links add `~stars`, one char per stat: `-` any, 0–9, `a` = 10. Slot relics use the chosen roll.
- **Pack vs public wiki:** this pack's configs differ from the defaults documented on public Relics wikis. For example, Drowned Belt charms are base 2, +0.1 per level, capped at 3, while the guides say 0–2 base and +1 per level. The site follows the pack.
- **UI:**
  - Points start unspent. Auto-spend (round-robin, lowest ability first) and Reset are buttons.
  - Moving the level slider keeps your spend and trims it if it no longer fits (`rlFit`).
  - Item pages get a "Relic levels" panel with the slider and per-ability −/+ steppers.
  - The Path filter bar has a global relic-level slider (`st.rl`, saved). Tooltips assume no spend: each ability shows its base value → the most that level could buy for that ability alone.
  - The Builder shows a panel for each equipped relic. Share links encode the level as `id~level~a.b.c`, and invalid spends are trimmed.
  - Slots a relic adds count its lowest roll.
- **Evolutions:** built from src lines "evolves from X" plus the Somake Spells I/II/III names, giving 12 chains (e.g. Converging Orb → Wonder of U; Slumbering → Whispering Amulet → Made in Heaven). They appear in tooltips, as an "Evolution" section on item pages and as an "Evolve →" button in the Builder.
- **Note:** Wonder of U maxes at relic level 13, not 15.

## Builder slots (19 Oct 2026)
- All 25 slot rows show at once; the "More slots" dropdown is gone.
- The generic Curio slot takes any accessory (`bFits`). Items tagged only "Curio" (the seven Powah Batteries) still fit nowhere else. Share links and evolve buttons follow the same rule; starter presets still use each curio's own slot.

## Verified
- All three scripts parse, and there are no console errors on the hub, path, item, mods and slot pages.
- Automated overlap and overflow audit at 1024 px and 375 px: no overlaps, no horizontal page scroll. The hub path strip scrolls sideways by design.
- New pages: every route loads with no console errors. That covers builder presets, share links reopened from a different page, the picker search, all boss pages, mechanics and recipe trees. The overlap audit is clean at 375, 1024 and 1900 px.

## Not done / open
- Curio list still comes from the upstream data, filtered by mod. Items the base pack adds through KubeJS curio tags, if any, aren't cross-checked against the jars.
- Rarity and "Must-Have" are the upstream wiki's ratings, not recomputed.
- Not checked on a real GPU or a real phone; the in-app browser pane was hidden during the checks.
- `#mechanics` reuses the upstream guide text. Its keeper table may still name The Calamities in places, so check it against the config.
- Stat totals only cover the plain "+N Stat" lines, about 250 of the 3,899 stat lines. Conditional and multiplier effects are listed, not summed.
- Player slot counts for Scroll, Spellstone and Focus are assumed to be 1. Confirm them in the instance's curios config.
