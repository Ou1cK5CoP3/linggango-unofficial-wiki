// Frame-time check for the wiki at 1920x1080 in Chromium.
// Usage: NODE_PATH=$(npm root -g) node build/perf.js dist/Linggango_Relic_Wiki.html [outdir]
// Measures rAF frame intervals while the page scrolls, hovers tiles and switches views,
// and long tasks (>50 ms) after first paint. Chromium is unthrottled (vsync off) so the
// numbers show how much headroom each frame has against the 8.33 ms budget of 120 Hz.
const { chromium } = require('playwright');
const path = require('path');

const FILE = path.resolve(process.argv[2] || 'dist/Linggango_Relic_Wiki.html');
const OUT = process.argv[3] || null;

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] || 0; };
const sum = xs => ({ frames: xs.length, p50: +pct(xs, 50).toFixed(2), p95: +pct(xs, 95).toFixed(2), p99: +pct(xs, 99).toFixed(2), max: +Math.max(0, ...xs).toFixed(2), over8: xs.filter(x => x > 8.34).length });

(async () => {
  const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    window.__rec = (ms) => new Promise(res => { const xs = []; let last = performance.now(); const t0 = last; const f = (t) => { xs.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(xs.slice(2)); }; requestAnimationFrame(f); });
  });
  const t0 = Date.now();
  await p.goto('file://' + FILE, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(1500);
  const res = { loadMs };
  const measure = async (name, action, ms = 3000) => {
    const rec = p.evaluate(m => window.__rec(m), ms);
    await action();
    res[name] = sum(await rec);
    if (OUT) await p.screenshot({ path: `${OUT}/perf-${name}.png` });
  };
  await measure('hub-idle', async () => {});
  await measure('hub-scroll', async () => { for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(90); } });
  await p.evaluate(() => { location.hash = '#home'; });
  await p.waitForTimeout(1200);
  const lt0 = await p.evaluate(() => window.__lt.length);
  await measure('path-scroll', async () => { for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, 160); await p.waitForTimeout(80); } });
  await measure('path-hover', async () => {
    const tiles = await p.$$('[data-t]');
    for (let i = 0; i < Math.min(40, tiles.length); i += 2) { try { await tiles[i].hover({ timeout: 500 }); } catch (e) {} await p.waitForTimeout(60); }
  });
  const ix = await p.evaluate(() => (typeof D !== 'undefined' ? D.findIndex(d => d.r >= 5) : 0));
  await measure('item-page', async () => { await p.evaluate(i => { location.hash = '#i' + i; }, ix); await p.waitForTimeout(800); for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(90); } });
  res.longTasksAfterLoad = (await p.evaluate(() => window.__lt)).slice(lt0).map(x => Math.round(x));
  res.errors = errors;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
