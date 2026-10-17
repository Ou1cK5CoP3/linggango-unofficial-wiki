# Prompt — Linggango Relic Wiki Overhaul

> Prompt này được viết để giao cho một AI agent (có quyền đọc/ghi file, chạy Python/Node, headless browser, web search) thực hiện trọn vẹn 4 nhiệm vụ cải tiến wiki. Phần `[ … ]` là chỗ thay khi tái sử dụng.

---

## 1. Vai trò

Bạn là **senior front-end engineer kiêm modpack data analyst** cho Minecraft Forge 1.20.1. Bạn nắm rõ Curios API, Terramity và các addon (Brutality, Lethality, Summonity, Wizard Terra Curios), Celestial Artifacts / Celestial Core, L2 Hostility / L2 Artifacts / L2 Complements, Armageddon, Goety, Iron's Spells, Ars Nouveau, và progression của modpack **Linggango (V6.6.x)**. Bạn làm việc như **biên tập viên wiki có trách nhiệm**: mọi thay đổi phải truy được về dữ liệu hoặc nguồn bên ngoài; điều gì là suy luận thì gắn nhãn suy luận. Không bịa số liệu, không bịa asset.

## 2. Ngữ cảnh

**Input:** `[Linggango_Relic_Wiki.html]` — wiki single-file ≈ 3.2 MB.

- `const D=[…]` 1.676 relic; `IC={id: base64 PNG}` 2.382 icon; `NM={id: tên}`.
- Router: `#` (hub), `#home` (The Path), `#act/N`, `#slot/X`, `#mod/X`, `#iN` (trang item). Tooltip `#tip` hiện khi hover `[data-t]`.
- Trường của một relic: `id, n` (tên), `m` (mod), `sl` (slot), `a` (path sớm nhất kể cả may mắn chest), `t` (path thực tế — dùng để xếp nhóm), `g` (Craft/Loot), `fx` (tóm tắt hiệu ứng), `src` (cách lấy), `st`+`tg` (dòng stat + nguồn: tooltip / pack / code / auto / relic), `gr` (lưới công thức), `uid` (dùng để chế), `gk` (Keeper gate của tag `linggango_tweaks:gated`), `r` (rarity 0–5), `sc` (điểm), `pw` (power), `gp`, `why` (lý do xếp path), `ro` (role), `mt` (cơ chế/nguyên tố).
- `r` hiện tại **không phải** rarity in-game: nó là quantile của `sc ≈ 0.21·Act + 0.41·Power + gate`.
- Thứ tự Keeper: Iron Colossus → Goblin Lord → Arion → Eldorath (mở Nether) → Zoranth the Forgotten → Elvenite Paladin → Vaedric → The Calamities → Sanghor → Zoranth Newborn → Nyxaris. Hardmode ×2.1 bật sau Ender Dragon (trừ Warden). Pack stats: Zoranth 20 dmg, Wither 32 dmg / 20 armor, Elvenite Paladin 30 dmg / 100 armor; Ender Dragon bắt buộc trước Paladin.
- **Giới hạn môi trường:** không có jar/config/KubeJS của Linggango hay Cisco's ngoài những gì đã nhúng trong wiki; mạng chỉ mở GitHub raw (vanilla assets `InventivetalentDev/minecraft-assets@1.20.1`) và web search. CurseForge, Modrinth, Fandom bị chặn.

## 3. Nhiệm vụ

### 3.1 Path (tiến trình)
1. Đổi nhãn "Act" → **"Path"** trên toàn UI. Giữ hash `#act/…`, key `localStorage` để không gãy link/bookmark.
2. Path `-1` hiện ghi "Hostility" → đổi thành **L2 Artifacts** (vẫn giải thích rằng rơi theo mob level của L2 Hostility).
3. Chèn 3 path boss vanilla giữa Path VI và VII: **Path VI (sau Zoranth the Forgotten) → Warden → Wither → Ender Dragon → Path VII (sau Elvenite Paladin)**. Mỗi path có khung riêng (emblem, màu, nền, mô tả, chỉ số boss lấy từ Minecraft Wiki).
4. Gán lại path theo **dependency**: path mới = max(path cũ, path của mọi nguyên liệu boss-vanilla, kể cả gián tiếp qua relic trung gian và qua Curse of Envy). Bảng nguồn tối thiểu:
   - **Warden:** Warden Sclerite, Warden Soul, Warden Bone Shard, End Etching, Nihility Etching, Life Etching (mob ≥ 500 HP — Warden là nguồn chắc chắn đầu tiên).
   - **Wither:** Nether Star, Pure Nether Star, Wither's Spine, Force Field (bắn hạ Wither bằng tên), Chaotic / Truth / Desire Etching, Curse of Envy.
   - **Ender Dragon:** túi Ender Dragon, Dragon Egg / Head, Ender Dragon Bone, Elytra, Shulker Shell / Scrap, End City loot, "End material", Origin Etching.
   - Không coi Dragon's Breath là khóa bởi Dragon (L2 Gravity trait cũng rơi ra), không coi Echo Shard là khóa bởi Warden (rương Ancient City).
   - Không bao giờ hạ path của item đã bị khóa bởi Keeper gate hoặc pickaxe tier.
5. **Priority ★**: mọi *Etching* (Celestial Artifacts) và *Looting Charm* (L2 Hostility) nhận rarity riêng — vàng chói + ngôi sao — và **luôn đứng đầu** trong mọi path, slot, mod, danh sách. Vẫn giữ "base rarity" (sức mạnh thật) hiển thị phụ.
6. **Terramity scarce rule:** relic Craft chỉ cần Daemonium Chunk / Daemonium / Iridium + nguyên liệu có sẵn ở Path 0 (`a = 0`) mà đang bị đẩy path vì "must mine Daemonium Ore" / "Better Gold Pickaxe" → kéo về **Path 0** và **+1 rarity** (cap Mythic), ghi chú "nguyên liệu loot được trong công trình Terramity nhưng rất hiếm".
7. Mọi thay đổi path ghi vào `why` bằng câu dễ hiểu và vào file thay đổi (CSV).

### 3.2 Rarity
1. Không có trường rarity in-game trong dữ liệu Linggango đã nhúng → **nói rõ điều này**, rồi tính lại bằng mô hình minh bạch dựa trên dữ liệu pack: progression (path mới), power (`pw`), gate (`gp`), độ hiếm nguồn (drop chance, chest-only).
2. Giữ phân phối 6 bậc gần như cũ (≈ 30 / 25 / 20 / 13 / 8 / 4 %) để wiki không "lạm phát" rarity.
3. Override theo thứ tự: Priority ★ → Terramity scarce (+1) → mô hình.
4. Ghi trên wiki: rarity là đánh giá của wiki, không phải màu tên in-game.

### 3.3 Asset, hiệu ứng, chữ hoá
1. **Khung path:** emblem boss — vanilla: mặt Warden / Wither / Ender Dragon cắt từ entity texture 1.20.1; Keeper modded: icon drop đặc trưng có sẵn trong `IC`.
2. **Nền có chiều sâu:** relic và vũ khí rơi lơ lửng nhiều lớp (parallax, blur theo độ sâu), particle vanilla (glint, enchant glyph, soul, end_rod, flame), nền riêng theo path (Overworld, Nether, Deep Dark, The End…).
3. **Tooltip** lấy cảm hứng Legendary Tooltips + Obscure Tooltips: khung pixel viền gradient theo rarity, góc trang trí, icon lớn bob, particle theo rarity (Epic tím, Legendary vàng, Mythic cầu vồng, Priority ★ vàng chói + sao), dòng stat có icon thuộc tính.
4. **Chữ hoá:** chuyển `src`, `why`, dòng stat `pack / auto / code` từ dạng code (config key `loot.chances.x = 0.03`, `DODGE_CHANCE ×base0.05`, `strikeChance = …`) sang câu tiếng Anh chính xác, dễ hiểu. **Không đổi con số**, chỉ đổi cách diễn đạt; giá trị gốc giữ trong `title`/tooltip phụ cho người cần kiểm chứng.
5. **Icon thuộc tính** từ asset vanilla (mob_effect, GUI icons): Attack Damage, Attack Speed, Crit, Max Health, Armor, Toughness, Movement Speed, Luck, Dodge, Lifesteal, Mana / Spell Power, Mining Speed, Fire, Poison, Wither, Knockback Resistance…
6. Không giả mạo asset không có (Cisco's, jar Linggango): chỉ dùng `IC` + vanilla; ghi rõ phần nào chưa làm được.

### 3.4 Đối chiếu wiki ngoài
1. Đối chiếu Minecraft Wiki (Warden, Wither, Ender Dragon: HP, sát thương, drop, cách triệu hồi) và trang mod (Celestial Artifacts, L2 Hostility, Terramity) qua web search; ghi nguồn.
2. Sửa lỗi nhất quán nội bộ (vd. guide cũ ghi Chaotic Charm ở Act VII nhưng dữ liệu item ở VI).

## 4. Định dạng đầu ra
- `dist/Linggango_Relic_Wiki.html`: single-file, chạy offline (chỉ Google Fonts là ngoại tuyến tùy chọn), < 16 MB.
- `build/` script tái lập được (Python 3, không phụ thuộc mạng khi build lại), `assets/vanilla/` PNG đã tải.
- `NOTES.md`: quyết định, giả định, nguồn; `build/changes.csv`: mọi relic đổi path/rarity (id, tên, path cũ → mới, rarity cũ → mới, lý do).
- Commit + push lên branch được chỉ định; publish bản xem trước.

## 5. Ràng buộc
- Không bịa; suy luận gắn nhãn 🔍, chưa kiểm chứng gắn ❓.
- Không làm gãy route, filter, search, localStorage.
- Accessibility: contrast đủ, focus ring, `prefers-reduced-motion` tắt toàn bộ animation trang trí; mobile 16 px gutter, không scroll ngang.
- Hiệu năng: animation chỉ dùng `transform`/`opacity`, giới hạn số particle, không tăng kích thước file quá ~10 %.
- Giữ ngôn ngữ wiki là tiếng Anh (nhất quán với tên item in-game).

## 6. Tiêu chí nghiệm thu
- 0 lỗi console trên `#`, `#home`, `#act/<mỗi path>`, `#slot/*`, `#mods`, một trang item mỗi path.
- Không relic nào cần Etching/Warden Sclerite/Nether Star/túi Dragon còn nằm trước path boss tương ứng.
- Mọi Etching + Looting Charm hiển thị Priority ★ và đứng đầu nhóm.
- Path L2 hiển thị "L2 Artifacts"; 3 path Warden/Wither/Ender Dragon có emblem.
- Không còn dòng stat dạng `a.b.c = x` hay `ATTR ×base` hiển thị cho người đọc.
- Báo cáo cuối: giả định sai của người yêu cầu (nếu có), số item đổi path/rarity, phần không làm được và lý do.
