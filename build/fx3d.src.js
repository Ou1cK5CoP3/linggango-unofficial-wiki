// Shared WebGL stage for boss models.
// One renderer draws into a fixed full-viewport canvas behind the page; every [data-boss] element
// that is on screen gets a scissor viewport. Off-screen mounts cost nothing; with no mounts on screen
// the loop stops. snapshot() renders a still portrait once and caches it as an image URL.
import * as THREE from 'three';
import { loadBoss, measure } from './geo2three.js';

const recs = window.B3 || {};
const cache = new Map();          // key -> Promise<{group, anim, box}>
const shots = new Map();          // key|w|h -> dataURL
const mounts = new Map();         // element -> mount
let renderer = null, canvas = null, running = false, t0 = performance.now();

function ensure() {
  if (renderer) return;
  canvas = document.createElement('canvas');
  canvas.id = 'glstage';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  resize();
  addEventListener('resize', resize, { passive: true });
}
function resize() { if (renderer) renderer.setSize(innerWidth, innerHeight, false); }

function lights(scene, tint) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f52, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(3, 6, 5); scene.add(sun);
  const rim = new THREE.DirectionalLight(tint || 0x99aaff, 1.1); rim.position.set(-4, 3, -5); scene.add(rim);
}

function load(key) {
  if (!cache.has(key)) {
    const rec = recs[key];
    cache.set(key, rec ? loadBoss(rec).then(b => {
      const anim = rec.anim && (rec.anim.idle || Object.values(rec.anim)[0]) ? b.animator(rec.anim.idle ? 'idle' : Object.keys(rec.anim)[0]) : null;
      if (anim) anim.update(0);
      return { group: b.group, anim, box: measure(b.group) };
    }) : Promise.resolve(null));
  }
  return cache.get(key);
}

function frame(cam, box, aspect, yaw, pitch = 12, fill = 1) {
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.y / 2 / Math.max(aspect, 0.6), size.length() / 2.6) / fill;
  const dist = r / Math.tan(cam.fov * Math.PI / 360);
  const a = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  cam.aspect = aspect;
  cam.position.set(c.x + Math.sin(a) * Math.cos(p) * dist, c.y + Math.sin(p) * dist, c.z + Math.cos(a) * Math.cos(p) * dist);
  cam.near = dist / 50; cam.far = dist * 10;
  cam.lookAt(c); cam.updateProjectionMatrix();
}

/** Live 3D view inside el (transparent element). Returns an unmount function. */
export function mount(el, key, opts = {}) {
  if (!recs[key] || mounts.has(el)) return () => {};
  ensure();
  const m = { el, key, scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(28, 1, 0.1, 100), ready: false, visible: false, yaw: opts.yaw ?? 28, spin: opts.spin ?? 0, drag: 0, drift: 0 };
  lights(m.scene, opts.tint);
  load(key).then(b => { if (!b || !mounts.has(el)) return; m.b = b; m.scene.add(b.group); m.ready = true; kick(); });
  m.io = new IntersectionObserver(es => { m.visible = es[0].isIntersecting; kick(); }, { rootMargin: '80px' });
  m.io.observe(el);
  // drag to turn
  let px = null;
  m.down = e => { px = e.clientX; el.setPointerCapture(e.pointerId); };
  m.move = e => { if (px == null) return; m.drag += (e.clientX - px) * 0.5; px = e.clientX; kick(); };
  m.up = () => { px = null; };
  el.addEventListener('pointerdown', m.down); el.addEventListener('pointermove', m.move); el.addEventListener('pointerup', m.up);
  mounts.set(el, m);
  return () => unmount(el);
}
export function unmount(el) {
  const m = mounts.get(el); if (!m) return;
  m.io.disconnect(); mounts.delete(el);
  if (m.b) m.scene.remove(m.b.group);
}
export function unmountAll() { [...mounts.keys()].forEach(unmount); if (renderer) renderer.clear(); }

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }
function loop(now) {
  // drop mounts whose element left the document (view change)
  for (const [el, m] of mounts) if (!el.isConnected) unmount(el);
  const live = [...mounts.values()].filter(m => m.ready && m.visible);
  if (!live.length || document.hidden) { running = false; renderer && renderer.clear(); return; }
  const H = innerHeight, t = (now - t0) / 1000;
  renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
  for (const m of live) {
    const r = m.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.width < 2) continue;
    if (m.b.anim && !reduce.matches) m.b.anim.update(t);
    const yaw = m.yaw + m.drag + (reduce.matches ? 0 : Math.sin(t * 0.35) * 10 + t * m.spin);
    frame(m.cam, m.b.box, r.width / r.height, yaw, 10, m.el.dataset.fill ? +m.el.dataset.fill : 1);
    const x = r.left, y = H - r.bottom;
    // the canvas sits above the page, so clip away the part hidden under the sticky top bar
    const top = (document.querySelector('.top') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom;
    const visTop = Math.max(r.top, top);
    if (visTop >= r.bottom) continue;
    renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.bottom - visTop);
    renderer.render(m.scene, m.cam);
  }
  requestAnimationFrame(loop);
}

/** Still portrait (cached). Renders off-screen once, returns a data URL. */
let snapR = null;
const idle = () => new Promise(r => (window.requestIdleCallback || setTimeout)(() => r(), { timeout: 400 }));
/** Still portrait (cached). One shared off-screen renderer, run in idle time. */
export async function snapshot(key, w = 160, h = 160, yaw = 30) {
  const id = key + '|' + w + '|' + h + '|' + yaw;
  if (shots.has(id)) return shots.get(id);
  const b = await load(key); if (!b) return null;
  await idle();
  if (!snapR) { snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); snapR.outputColorSpace = THREE.SRGBColorSpace; snapR.setClearColor(0, 0); snapR.setPixelRatio(2); }
  snapR.setSize(w, h, false);
  const scene = new THREE.Scene(); lights(scene); const g = b.group.clone(true); scene.add(g);
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.1, 100); frame(cam, b.box, w / h, yaw, 10, 1.05);
  snapR.render(scene, cam);
  const blob = await new Promise(r => snapR.domElement.toBlob(r, 'image/png'));
  const url = URL.createObjectURL(blob);
  shots.set(id, url);
  return url;
}

window.Boss3D = { mount, unmount, unmountAll, snapshot, has: k => !!recs[k] };
