# Linggango Wiki (base pack): handoff

A copy of tranquanghaofake-dotcom/Linggango-Relic-Wiki, cut down to **base** Linggango V6.6.5b4, with the lag and tearing fixed.
Upstream has no license: fine for personal use; ask the user before publishing it anywhere.
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
- **Tearing:** live 3D bosses were drawn on one fixed full-screen WebGL canvas that redraws a frame behind scroll. They're now static snapshots (`Boss3D.snapshot`), so there's no WebGL loop and no drag-to-rotate.
- **Phone layout:** path hero stacks below 640 px. The boss card used to be clipped off-screen.

## Verified
- All three scripts parse, and there are no console errors on the hub, path, item, mods and slot pages.
- Automated overlap and overflow audit at 1024 px and 375 px: no overlaps, no horizontal page scroll. The hub path strip scrolls sideways by design.

## Not done / open
- Curio list still comes from the upstream data, filtered by mod. Items the base pack adds through KubeJS curio tags, if any, aren't cross-checked against the jars.
- Rarity and "Must-Have" are the upstream wiki's ratings, not recomputed.
- Not checked on a real GPU or a real phone; the in-app browser pane was hidden during the checks.
- The disabled `#guide` page (old "Act" text, still lists The Calamities) is untouched.
