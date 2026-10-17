// geo2three.js — Bedrock / GeckoLib geometry + animation -> three.js
// ES module. Usage:
//   import * as THREE from 'three';
//   import { buildGeo, createAnimator } from './geo2three.js';
//   const tex = await new THREE.TextureLoader().loadAsync('data:image/png;base64,' + boss.texture);
//   const model = buildGeo(boss.geo, tex, { glow, layers, scale: boss.scale });
//   const anim  = createAnimator(model, boss.anim.idle);
//   renderer.setAnimationLoop(t => { anim.update(t / 1000); renderer.render(scene, camera); });
//
// Coordinate conventions reproduced exactly from GeckoLib 4 (BakedModelFactory / RenderUtils), which is
// also what Blockbench's Bedrock codec does:
//   * internal x = -bedrock x  (cube from.x = -(origin.x + size.x), pivot.x = -pivot.x)
//   * rotations: x and y negated, z kept, applied Z then Y then X (THREE Euler order 'ZYX')
//   * animation rotation keyframes: (-x, -y, z) degrees added to the bind rotation
//   * animation position keyframes: (-x, y, z) pixels added to the bone offset; scale multiplies
//   * box UV sizes are floored (GeckoLib), mirror flips u and swaps east/west (Bedrock/Blockbench)
// The returned group is in block units (1/16), feet on y = 0 for standard entity models, model front facing +Z
// (GeckoLib renders entities with Ry(180 - yaw); we apply the 180 so the face looks at a camera on +Z).

import * as THREE from 'three';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// Geometry file normalisation
// ---------------------------------------------------------------------------------------------
export function normalizeGeo(json, identifier) {
  if (typeof json === 'string') json = JSON.parse(json);
  if (!json) throw new Error('normalizeGeo: empty geometry');
  if (Array.isArray(json.bones) && (json.description || !json['minecraft:geometry'])) {
    const d = json.description || {};
    return { description: { ...d, texture_width: d.texture_width ?? json.texturewidth, texture_height: d.texture_height ?? json.textureheight }, bones: json.bones };
  }
  if (Array.isArray(json['minecraft:geometry'])) {
    const list = json['minecraft:geometry'];
    const g = identifier ? list.find(x => x.description && x.description.identifier === identifier) : list[0];
    if (!g) throw new Error('normalizeGeo: geometry ' + identifier + ' not found');
    return normalizeGeo(g);
  }
  // legacy 1.8 format: { "geometry.name": { texturewidth, textureheight, bones } }
  const keys = Object.keys(json).filter(k => k.startsWith('geometry.'));
  const key = identifier ? keys.find(k => k === identifier || k.split(':')[0] === identifier) : keys[0];
  if (!key) throw new Error('normalizeGeo: unrecognised geometry json');
  const g = json[key];
  return {
    description: {
      identifier: key.split(':')[0],
      texture_width: g.texturewidth ?? 64, texture_height: g.textureheight ?? 64,
      visible_bounds_width: g.visible_bounds_width, visible_bounds_height: g.visible_bounds_height,
      visible_bounds_offset: g.visible_bounds_offset,
    },
    bones: g.bones || [],
  };
}

// ---------------------------------------------------------------------------------------------
// Cube -> triangles
// ---------------------------------------------------------------------------------------------
// Face order and corner order follow THREE.BoxGeometry / Blockbench (TL, TR, BL, BR seen from outside).
const FACES = ['east', 'west', 'up', 'down', 'south', 'north'];
const NORMALS = { east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0], south: [0, 0, 1], north: [0, 0, -1] };

function faceCorners(face, a, b) {
  const [x1, y1, z1] = a, [x2, y2, z2] = b;
  switch (face) {
    case 'east':  return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z2], [x2, y1, z1]];
    case 'west':  return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z1], [x1, y1, z2]];
    case 'up':    return [[x1, y2, z1], [x2, y2, z1], [x1, y2, z2], [x2, y2, z2]];
    case 'down':  return [[x1, y1, z2], [x2, y1, z2], [x1, y1, z1], [x2, y1, z1]];
    case 'south': return [[x1, y2, z2], [x2, y2, z2], [x1, y1, z2], [x2, y1, z2]];
    case 'north': return [[x2, y2, z1], [x1, y2, z1], [x2, y1, z1], [x1, y1, z1]];
  }
}

// Returns {face: [u1, v1, u2, v2] | null} in texture pixels.
function cubeUVs(cube, mirror) {
  const uv = cube.uv;
  const out = {};
  if (Array.isArray(uv) || uv == null) {
    const u = uv ? uv[0] : 0, v = uv ? uv[1] : 0;
    const w = Math.floor(cube.size[0]), h = Math.floor(cube.size[1]), d = Math.floor(cube.size[2]);
    out.east  = [u, v + d, u + d, v + d + h];
    out.west  = [u + d + w, v + d, u + 2 * d + w, v + d + h];
    out.up    = [u + d + w, v + d, u + d, v];
    out.down  = [u + d + 2 * w, v, u + d + w, v + d];
    out.south = [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h];
    out.north = [u + d, v + d, u + d + w, v + d + h];
    if (mirror) {
      for (const f of FACES) { const r = out[f]; out[f] = [r[2], r[1], r[0], r[3]]; }
      const e = out.east; out.east = out.west; out.west = e;
    }
  } else {
    for (const f of FACES) {
      const fu = uv[f];
      if (!fu || !fu.uv) { out[f] = null; continue; }
      const s = fu.uv_size || [0, 0];
      let r = [fu.uv[0], fu.uv[1], fu.uv[0] + s[0], fu.uv[1] + s[1]];
      if (f === 'up' || f === 'down') r = [r[2], r[3], r[0], r[1]];
      r.rot = ((fu.uv_rotation || 0) % 360 + 360) % 360;
      out[f] = r;
    }
  }
  return out;
}

function rotMatrix(rx, ry, rz) { // radians, internal space, order Z * Y * X
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'ZYX'));
}

// Appends one cube to the arrays. Positions are relative to bonePivot (internal coords).
function emitCube(cube, bone, bonePivot, texW, texH, P, N, U, I, boneMirror) {
  const size = cube.size || [0, 0, 0];
  const o = cube.origin || [0, 0, 0];
  const inf = cube.inflate ?? bone.inflate ?? 0;
  // GeckoLib 4 (BakedModelFactory.constructCube) reads only the cube's own "mirror"; Bedrock/Blockbench also inherit the bone's.
  const mirror = cube.mirror ?? (boneMirror ? bone.mirror : false) ?? false;
  const a = [-(o[0] + size[0]) - inf, o[1] - inf, o[2] - inf];
  const b = [-o[0] + inf, o[1] + size[1] + inf, o[2] + size[2] + inf];
  let m = null;
  if (cube.rotation && (cube.rotation[0] || cube.rotation[1] || cube.rotation[2])) {
    const p = cube.pivot || [0, 0, 0];
    const piv = new THREE.Vector3(-p[0], p[1], p[2]);
    m = new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z)
      .multiply(rotMatrix(-cube.rotation[0] * DEG, -cube.rotation[1] * DEG, cube.rotation[2] * DEG))
      .multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z));
  }
  const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  const uvs = cubeUVs(cube, mirror);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const f of FACES) {
    const r = uvs[f];
    if (!r) continue;
    const c = faceCorners(f, a, b);
    // corner uv (TL, TR, BL, BR) in pixels
    let cu = [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]];
    if (r.rot) { // Bedrock uv_rotation: texture turned clockwise in 90° steps -> shift corners around the ring TL,TR,BR,BL
      const ring = [cu[0], cu[1], cu[3], cu[2]];
      const k = Math.round(r.rot / 90) % 4;
      const sh = i => ring[(i + 4 - k) % 4];
      cu = [sh(0), sh(1), sh(3), sh(2)];
    }
    const base = P.length / 3;
    n.fromArray(NORMALS[f]); if (nm) n.applyMatrix3(nm).normalize();
    for (let k = 0; k < 4; k++) {
      v.fromArray(c[k]); if (m) v.applyMatrix4(m);
      P.push(v.x - bonePivot.x, v.y - bonePivot.y, v.z - bonePivot.z);
      N.push(n.x, n.y, n.z);
      U.push(cu[k][0] / texW, 1 - cu[k][1] / texH);
    }
    I.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  }
}

function prepTexture(t) {
  if (!t) return t;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * buildGeo(geo, texture, opts) -> THREE.Group
 *   geo:     geometry object (or a whole .geo.json; first geometry used unless opts.identifier)
 *   texture: THREE.Texture (main skin)
 *   opts: {
 *     texW, texH      override texture size (else geo description, else image size)
 *     scale           extra uniform scale (GeckoLib renderer scaleWidth/scaleHeight), default 1
 *     material        a THREE.Material to use instead of the default MeshLambertMaterial
 *     transparent     true -> alpha blending (texture has semi-transparent pixels); default cutout (alphaTest 0.1)
 *     glow            THREE.Texture rendered as an additive 'eyes' layer on all bones (GeckoLib/vanilla RenderType.eyes)
 *     layers          [{ texture, mode: 'eyes'|'emissive', opacity, bones: [names] | undefined }]
 *     faceCamera      default true: rotate 180° so the model front faces +Z
 *     boneMirror      default false (GeckoLib); true = Bedrock/Blockbench rule (cubes inherit the bone's mirror flag)
 *   }
 * userData: { bones: Map(lowercase name -> Object3D), rest: Map(Object3D -> {p, r}), layers: [Material], geo }
 */
export function buildGeo(geoIn, texture, opts = {}) {
  const geo = normalizeGeo(geoIn, opts.identifier);
  const desc = geo.description || {};
  const img = texture && texture.image;
  const texW = opts.texW || desc.texture_width || (img && img.width) || 64;
  const texH = opts.texH || desc.texture_height || (img && img.height) || 64;
  prepTexture(texture);

  const material = opts.material || new THREE.MeshLambertMaterial({
    map: texture, side: THREE.DoubleSide,
    alphaTest: opts.transparent ? 0.004 : 0.1,
    transparent: !!opts.transparent, depthWrite: true,
  });
  const layerSpecs = [];
  if (opts.glow) layerSpecs.push({ texture: opts.glow, mode: 'eyes', opacity: 1 });
  for (const l of opts.layers || []) layerSpecs.push(l);
  const layerMats = layerSpecs.map(l => {
    prepTexture(l.texture);
    const mat = new THREE.MeshBasicMaterial({
      map: l.texture, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      blending: l.mode === 'eyes' ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: l.opacity ?? 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    mat.userData = { name: l.name || l.mode, alpha: l.alpha, bones: l.bones ? new Set(l.bones.map(s => s.toLowerCase())) : null };
    return mat;
  });

  const inner = new THREE.Group();
  inner.name = 'geo:' + (desc.identifier || 'model');
  const nodes = new Map();      // bone name -> Object3D
  const pivots = new Map();     // bone name -> Vector3 internal pivot
  for (const bone of geo.bones) {
    const g = new THREE.Group();
    g.name = bone.name;
    const p = bone.pivot || [0, 0, 0];
    pivots.set(bone.name, new THREE.Vector3(-p[0], p[1], p[2]));
    const r = bone.rotation || [0, 0, 0];
    g.rotation.set(-r[0] * DEG, -r[1] * DEG, r[2] * DEG, 'ZYX');
    nodes.set(bone.name, g);
  }
  for (const bone of geo.bones) {
    const g = nodes.get(bone.name);
    const piv = pivots.get(bone.name);
    const parent = bone.parent && nodes.get(bone.parent);
    const ppiv = parent ? pivots.get(bone.parent) : new THREE.Vector3();
    g.position.copy(piv).sub(ppiv);
    (parent || inner).add(g);
    const cubes = bone.neverRender ? [] : (bone.cubes || []);
    if (!cubes.length) continue;
    const P = [], N = [], U = [], I = [];
    for (const c of cubes) emitCube(c, bone, piv, texW, texH, P, N, U, I, opts.boneMirror);
    if (!I.length) continue;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    bg.setIndex(I);
    bg.computeBoundingSphere();
    const mesh = new THREE.Mesh(bg, material);
    mesh.name = bone.name + ':mesh';
    g.add(mesh);
    for (const lm of layerMats) {
      if (lm.userData.bones && !lm.userData.bones.has(bone.name.toLowerCase())) continue;
      const lmesh = new THREE.Mesh(bg, lm);
      lmesh.name = bone.name + ':' + lm.userData.name;
      lmesh.renderOrder = 1;
      g.add(lmesh);
    }
  }

  const root = new THREE.Group();
  root.name = 'boss';
  const s = (opts.scale || 1) / 16;
  inner.scale.setScalar(s);
  if (opts.faceCamera !== false) inner.rotation.y = Math.PI;
  root.add(inner);

  const bones = new Map();
  const rest = new Map();
  for (const [name, g] of nodes) {
    bones.set(name.toLowerCase(), g);
    rest.set(g, { p: g.position.clone(), r: g.rotation.clone(), s: g.scale.clone() });
  }
  root.userData = { bones, rest, layers: layerMats, material, geo, texW, texH };
  return root;
}

/** Axis-aligned bounds of the model in its current pose (world units of the group). */
export function measure(group) {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}

// ---------------------------------------------------------------------------------------------
// Molang (subset sufficient for GeckoLib / vanilla client animations)
// ---------------------------------------------------------------------------------------------
const MOLANG_CACHE = new Map();
const ALLOWED = /^[0-9a-z_.+\-*/%()<>=!&|?:,\s]*$/;
const MATH = {
  sin: d => Math.sin(d * DEG), cos: d => Math.cos(d * DEG), asin: x => Math.asin(x) / DEG, acos: x => Math.acos(x) / DEG,
  atan: x => Math.atan(x) / DEG, atan2: (y, x) => Math.atan2(y, x) / DEG, abs: Math.abs, sqrt: Math.sqrt,
  pow: Math.pow, exp: Math.exp, ln: Math.log, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  min: Math.min, max: Math.max, mod: (a, b) => a % b, clamp: (v, a, b) => Math.min(Math.max(v, a), b),
  lerp: (a, b, t) => a + (b - a) * t, lerprotate: (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t,
  hermite_blend: t => 3 * t * t - 2 * t * t * t, sign: Math.sign, pi: Math.PI,
  random: (a, b) => a + Math.random() * (b - a), die_roll: (n, a, b) => { let s = 0; for (let i = 0; i < n; i++) s += a + Math.random() * (b - a); return s; },
  min_angle: a => { a = ((a % 360) + 360) % 360; return a >= 180 ? a - 360 : a; },
};

export function compileMolang(src) {
  if (typeof src === 'number') return () => src;
  const key = String(src);
  if (MOLANG_CACHE.has(key)) return MOLANG_CACHE.get(key);
  let s = key.trim().toLowerCase();
  if (s === '') { MOLANG_CACHE.set(key, () => 0); return () => 0; }
  const num = Number(s);
  if (!Number.isNaN(num)) { const f = () => num; MOLANG_CACHE.set(key, f); return f; }
  if (!ALLOWED.test(s)) { console.warn('molang: rejected', key); const f = () => 0; MOLANG_CACHE.set(key, f); return f; }
  s = s.replace(/;\s*$/, '')
    .replace(/\bmath\.pi\b/g, 'M.pi')
    .replace(/\bmath\.([a-z_]+)/g, 'M.$1')
    .replace(/\b(query|q)\.([a-z_]+)/g, 'Q.$2')
    .replace(/\b(variable|v)\.([a-z_0-9.]+)/g, (m, _, n) => 'V[' + JSON.stringify(n) + ']')
    .replace(/\b(temp|t)\.([a-z_0-9]+)/g, (m, _, n) => 'V[' + JSON.stringify('t.' + n) + ']')
    .replace(/\bthis\b/g, 'THIS')
    .replace(/\btrue\b/g, '1').replace(/\bfalse\b/g, '0')
    // any other bare identifier is an unknown molang variable -> 0 (GeckoLib's parser does the same;
    // some GeckoLib exports contain "vector": ["linear","linear","linear"])
    .replace(/(?<![.\w"])([a-z_][a-z0-9_]*)(?![\w."(\[])/g, '0');
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    const inner = new Function('M', 'Q', 'V', 'THIS', '"use strict"; return (' + s + ');');
    fn = (ctx, self = 0) => { const r = +inner(MATH, ctx.q, ctx.v, self); return Number.isFinite(r) ? r : 0; };
  } catch (e) {
    console.warn('molang: cannot compile', key, e.message);
    fn = () => 0;
  }
  MOLANG_CACHE.set(key, fn);
  return fn;
}

// ---------------------------------------------------------------------------------------------
// Easing (GeckoLib 4 EasingType)
// ---------------------------------------------------------------------------------------------
const easeIn = f => t => f(t);
const easeOut = f => t => 1 - f(1 - t);
const easeInOut = f => t => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2);
const pow = n => t => Math.pow(t, n);
const sine = t => 1 - Math.cos(t * Math.PI / 2);
const circle = t => 1 - Math.sqrt(1 - t * t);
const expo = t => Math.pow(2, 10 * (t - 1));
const back = k => { k = k ?? 1.70158; return t => t * t * ((k + 1) * t - k); };
const elastic = k => { const b = (k ?? 1) * Math.PI; return t => 1 - Math.pow(Math.cos(t * Math.PI / 2), 3) * Math.cos(t * b); };
const bounce = k => {
  k = k ?? 0.5;
  const q = x => (121 / 16) * x * x, w = x => (121 / 4) * k * Math.pow(x - 6 / 11, 2) + 1 - k;
  const r = x => 121 * k * k * Math.pow(x - 9 / 11, 2) + 1 - k * k, z = x => 484 * k * k * k * Math.pow(x - 10.5 / 11, 2) + 1 - k * k * k;
  return x => Math.min(q(x), w(x), r(x), z(x));
};
const step = k => { const n = Math.max(1, Math.round(k ?? 2)); return t => Math.floor(t * n) / n; };
function easingFn(name, args) {
  const a = Array.isArray(args) ? args[0] : args;
  switch ((name || 'linear').toLowerCase()) {
    case 'linear': return t => t;
    case 'step': return step(a);
    case 'easeinsine': return easeIn(sine); case 'easeoutsine': return easeOut(sine); case 'easeinoutsine': return easeInOut(sine);
    case 'easeinquad': return easeIn(pow(2)); case 'easeoutquad': return easeOut(pow(2)); case 'easeinoutquad': return easeInOut(pow(2));
    case 'easeincubic': return easeIn(pow(3)); case 'easeoutcubic': return easeOut(pow(3)); case 'easeinoutcubic': return easeInOut(pow(3));
    case 'easeinquart': return easeIn(pow(4)); case 'easeoutquart': return easeOut(pow(4)); case 'easeinoutquart': return easeInOut(pow(4));
    case 'easeinquint': return easeIn(pow(5)); case 'easeoutquint': return easeOut(pow(5)); case 'easeinoutquint': return easeInOut(pow(5));
    case 'easeinexpo': return easeIn(expo); case 'easeoutexpo': return easeOut(expo); case 'easeinoutexpo': return easeInOut(expo);
    case 'easeincirc': return easeIn(circle); case 'easeoutcirc': return easeOut(circle); case 'easeinoutcirc': return easeInOut(circle);
    case 'easeinback': return easeIn(back(a)); case 'easeoutback': return easeOut(back(a)); case 'easeinoutback': return easeInOut(back(a));
    case 'easeinelastic': return easeIn(elastic(a)); case 'easeoutelastic': return easeOut(elastic(a)); case 'easeinoutelastic': return easeInOut(elastic(a));
    case 'easeinbounce': return easeIn(bounce(a)); case 'easeoutbounce': return easeOut(bounce(a)); case 'easeinoutbounce': return easeInOut(bounce(a));
    default: return t => t;
  }
}

// ---------------------------------------------------------------------------------------------
// Animation sampling (GeckoLib keyframe semantics: the easing of keyframe i shapes the segment i-1 -> i)
// ---------------------------------------------------------------------------------------------
function vec3(v) {
  if (Array.isArray(v)) return [compileMolang(v[0] ?? 0), compileMolang(v[1] ?? 0), compileMolang(v[2] ?? 0)];
  const f = compileMolang(v); return [f, f, f];
}
function parseChannel(ch) {
  if (ch == null) return null;
  if (Array.isArray(ch) || typeof ch !== 'object') return { kind: 'const', v: vec3(ch) };
  if ('vector' in ch) return { kind: 'const', v: vec3(ch.vector) };
  if ('pre' in ch || 'post' in ch) { const v = vec3(ch.post ?? ch.pre); return { kind: 'const', v }; }
  const keys = Object.keys(ch).map(k => ({ k, t: parseFloat(k) })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const frames = keys.map(({ k, t }) => {
    const raw = ch[k];
    let pre, post, easing = 'linear', args, lerp = 'linear';
    if (Array.isArray(raw) || typeof raw !== 'object') { pre = post = vec3(raw); }
    else if ('vector' in raw) { pre = post = vec3(raw.vector); easing = raw.easing || 'linear'; args = raw.easingArgs; }
    else { pre = vec3(raw.pre ?? raw.post ?? 0); post = vec3(raw.post ?? raw.pre ?? 0); lerp = raw.lerp_mode || 'linear'; }
    return { t, pre, post, easing: lerp === 'catmullrom' ? 'catmullrom' : easing, ease: easingFn(easing, args) };
  });
  return frames.length ? { kind: 'keys', frames } : null;
}
function sampleChannel(c, t, ctx, base) {
  const ev = (v, i) => v[i](ctx, base[i]);
  if (c.kind === 'const') return [ev(c.v, 0), ev(c.v, 1), ev(c.v, 2)];
  const F = c.frames;
  if (t <= F[0].t) return [ev(F[0].pre, 0), ev(F[0].pre, 1), ev(F[0].pre, 2)];
  const L = F[F.length - 1];
  if (t >= L.t) return [ev(L.post, 0), ev(L.post, 1), ev(L.post, 2)];
  let i = 0; while (i < F.length - 2 && t >= F[i + 1].t) i++;
  const A = F[i], B = F[i + 1];
  const p = (t - A.t) / Math.max(1e-6, B.t - A.t);
  const out = [0, 0, 0];
  if (B.easing === 'catmullrom' || A.easing === 'catmullrom') {
    const P0 = F[Math.max(0, i - 1)], P3 = F[Math.min(F.length - 1, i + 2)];
    for (let k = 0; k < 3; k++) {
      const p0 = ev(P0.post, k), p1 = ev(A.post, k), p2 = ev(B.pre, k), p3 = ev(P3.pre, k);
      const t2 = p * p, t3 = t2 * p;
      out[k] = 0.5 * (2 * p1 + (-p0 + p2) * p + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    return out;
  }
  const e = B.ease(p);
  for (let k = 0; k < 3; k++) { const a = ev(A.post, k), b = ev(B.pre, k); out[k] = a + (b - a) * e; }
  return out;
}

/**
 * createAnimator(group, animation, opts) -> { duration, loop, update(seconds), reset() }
 *   animation: one entry of an .animation.json "animations" map ({loop, animation_length, bones})
 *   opts.speed (default 1), opts.vars (molang variables)
 * Each update() resets every bone to its bind pose, then applies the sampled channels.
 * Layer materials with userData.alpha (molang string) get their opacity driven by query.life_time.
 */
export function createAnimator(group, anim, opts = {}) {
  const ud = group.userData;
  const tracks = [];
  let maxT = 0;
  if (anim && anim.bones) {
    for (const [name, chans] of Object.entries(anim.bones)) {
      const node = ud.bones.get(name.toLowerCase());
      if (!node) continue;
      const tr = { node, rot: parseChannel(chans.rotation), pos: parseChannel(chans.position), scl: parseChannel(chans.scale) };
      for (const c of [tr.rot, tr.pos, tr.scl]) if (c && c.kind === 'keys') maxT = Math.max(maxT, c.frames[c.frames.length - 1].t);
      if (tr.rot || tr.pos || tr.scl) tracks.push(tr);
    }
  }
  const duration = anim && anim.animation_length ? +anim.animation_length : maxT;
  const loop = anim ? (anim.loop === true || anim.loop === 'true' ? true : anim.loop === 'hold_on_last_frame' ? 'hold' : false) : false;
  const speed = opts.speed ?? 1;
  const ctx = { q: { anim_time: 0, life_time: 0, delta_time: 1 / 60, ground_speed: 0, modified_move_speed: 0, is_on_ground: 1 }, v: { ...(opts.vars || {}) } };
  const layerAlpha = (ud.layers || []).filter(m => m.userData.alpha).map(m => ({ m, f: compileMolang(m.userData.alpha) }));
  const rest = ud.rest;
  const zero = [0, 0, 0];

  function reset() {
    for (const [node, r] of rest) { node.position.copy(r.p); node.rotation.copy(r.r); node.scale.copy(r.s); }
  }
  function update(seconds) {
    const life = seconds * speed;
    let t = life;
    if (duration > 0) {
      if (loop === true) t = life % duration;
      else t = Math.min(life, duration);
    }
    ctx.q.anim_time = t; ctx.q.life_time = life;
    reset();
    for (const tr of tracks) {
      const n = tr.node, r = rest.get(n);
      if (tr.rot) {
        const base = [-r.r.x / DEG, -r.r.y / DEG, r.r.z / DEG];
        const v = sampleChannel(tr.rot, t, ctx, base);
        n.rotation.set(r.r.x - v[0] * DEG, r.r.y - v[1] * DEG, r.r.z + v[2] * DEG, 'ZYX');
      }
      if (tr.pos) {
        const v = sampleChannel(tr.pos, t, ctx, zero);
        n.position.set(r.p.x - v[0], r.p.y + v[1], r.p.z + v[2]);
      }
      if (tr.scl) {
        const v = sampleChannel(tr.scl, t, ctx, [1, 1, 1]);
        n.scale.set(r.s.x * v[0], r.s.y * v[1], r.s.z * v[2]);
      }
    }
    for (const { m, f } of layerAlpha) m.opacity = Math.max(0, Math.min(1, f(ctx)));
  }
  return { duration, loop, update, reset, tracks: tracks.length };
}

/** Convenience: decode a base64 PNG into a THREE.Texture (resolves once the image is ready). */
export function textureFromBase64(b64) {
  return new THREE.TextureLoader().loadAsync('data:image/png;base64,' + b64).then(prepTexture);
}

/**
 * Convenience for the wiki: build + animate a boss record ({geo, texture, glow?, layers?, anim, scale, alpha}).
 * Returns { group, animator(name) }.
 */
export async function loadBoss(rec, opts = {}) {
  const tex = await textureFromBase64(rec.texture);
  const glow = rec.glow ? await textureFromBase64(rec.glow) : null;
  const layers = [];
  for (const l of rec.layers || []) layers.push({ ...l, texture: await textureFromBase64(l.texture) });
  const group = buildGeo(rec.geo, tex, { glow, layers, transparent: rec.alpha === 'blend', texW: rec.texW, texH: rec.texH, scale: opts.useRenderScale ? rec.scale : 1, ...opts });
  return { group, animator: (name = 'idle', o) => createAnimator(group, rec.anim && rec.anim[name], o) };
}
