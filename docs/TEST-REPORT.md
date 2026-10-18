# Fresh test: 18 Oct 2026

Run in the in-app Chromium (same engine as Opera GX). It started with no saved filters. The browser pane was hidden, so the timings were taken synchronously.

## Fixed during the test
1. **Search matched inside words.** "fire ring" returned 11 curios. 6 of them only matched through "trigge*ring*", "st*ring*" or "wea*ring*". Words now match from a word start, so it returns 6. Prefixes still work: "fire" finds "Firestorm".
2. **Phone header overflow.** On a 375 px phone the nav needed 387 px, so "Mechanics" ran off-screen and every page scrolled sideways. The nav now wraps to two rows.
3. **Search box refocus could scroll the page** after a re-render. It now refocuses without scrolling.

## Passed
- **Routes:** all 127 load (hub, The Path, 15 paths, 28 slots, 56 mods, 14 bosses, items, Builder, Mechanics). There were no JS errors and no "undefined" or "NaN" text.
- **Field search:**
  - Every count below was cross-checked against the raw data:
    - `slot:ring slot:necklace -mod:terramity`: 146
    - `source:"ender dragon"`: 33
    - `name:sigil`: 11
    - `path:xii`: 3
    - `-mod:relic`: 887, which plus `mod:relic` (440) is all 1,327
  - Filters are saved across a reload. A nonsense filter shows the "No curios match" note.
- **Filter UI:**
  - The Add filter picker has 56 mod, 28 slot and 72 stat suggestions. Values with spaces get quoted.
  - Removing a pill keeps your scroll position. "How it works" toggles. Clear all empties both search boxes.
- **Filters on other pages:**
  - The sidebar chips stack with the search: Mage + `slot:ring` gives 28, which matches the data.
  - The header search works from item pages.
  - Path, slot and mod pages honour filters ("580 hidden by filters"), with no jump back to The Path.
- **Slot pages:** Living Armour, Blasphemy and Sacrament show the "start with no slot" note. Ring doesn't.
- **Item pages:** 148 sampled. There were no broken links, recipe trees appeared where expected (none empty), and Copy works.
- **Builder:**
  - All 8 presets fill slots with nothing over cap.
  - Dropping to Path III flags 37 late curios with a warning.
  - Copy link works. The share link reopens the same build from another page.
  - The picker, add, remove and Clear all work.
- **Bosses:** all 14 pages have HP, How to summon it, unlocked curios and the model snapshot. Prev/next links chain correctly (13/13 each way).
- **Mechanics:** the Keeper table fixes are in. The damage calculator updates live.
- **Layout:** no sideways scroll on any page at 375 and 1024 px.
- **Speed:**
  - Hover costs about 0.1 ms per tile.
  - Rendering The Path takes about 80 ms, and Path 0–I about 36 ms.
  - There's 1 running animation and 1 `will-change` element.
  - The console has no errors.

## Not checked / notes
- Real mouse hover, real touch and a real GPU. The pane was hidden, so tooltips were checked by calling them directly. All 30 sampled had content.
- Presets fill odd slots too, e.g. a Hostility Curse (Curse of Sloth), a Bundle and a Binding Key. Worth deciding whether presets should skip curse slots.
- The damage calculator accepts a negative base damage. It's harmless, since the floor still applies.
