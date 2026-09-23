// Sdílené jádro: načtení modelu, rozbor, vrstvy, výkres. Používá web i admin.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export { THREE };
export * from "./core-lite.js";
import { STAGES, STAGE_ORDER, partKey } from "./core-lite.js";

const MAP_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];

export async function loadModel(url, onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url, onProgress);
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}

// Všechno, co se dá o modelu zjistit bez lidské pomoci.
export function analyze(gltf) {
  const root = gltf.scene;
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  let verts = 0, tris = 0;
  const textures = new Set();
  const has = { normalMap: false, map: false, materials: false };
  const jsonMats = gltf.parser?.json?.materials || [];
  has.materials = jsonMats.length > 0;
  const groups = new Map();
  for (const o of meshes) {
    const g = o.geometry;
    verts += g.attributes.position.count;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of [].concat(o.material)) {
      for (const k of MAP_KEYS) if (m[k]) textures.add(m[k]);
      if (m.normalMap) has.normalMap = true;
      if (m.map) has.map = true;
    }
    const key = partKey(o.name);
    if (!groups.has(key)) groups.set(key, { key, meshes: [] });
    groups.get(key).meshes.push(o);
  }
  const stages = STAGE_ORDER.filter(s => !STAGES[s].needs || has[STAGES[s].needs]);
  const maxTex = [...textures].reduce((a, t) => Math.max(a, t.image?.width || 0), 0);
  const genRaw = gltf.parser?.json?.asset?.generator || "";
  const genV = genRaw.match(/\bv(\d+\.\d+)/);   // "glTF 2.0" je verze formátu, ne Blenderu
  return {
    meshes, groups, stages, has,
    stats: {
      verts: Math.round(verts), tris: Math.round(tris), parts: meshes.length, shapes: groups.size,
      materials: jsonMats.length, textures: textures.size, textureSize: maxTex,
      generator: /blender/i.test(genRaw) ? ("Blender " + (genV ? genV[1] : "")).trim() : (/gltf-transform/i.test(genRaw) ? "" : genRaw),
    },
  };
}

export function centerModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  root.position.sub(box.getCenter(new THREE.Vector3()));
  root.updateMatrixWorld(true);
  const size = box.getSize(new THREE.Vector3());
  return { size, radius: size.length() / 2 };
}

// Materiály pro každou vrstvu, postavené jednou. Dvoustranné kvůli zrcadleným dílům.
export function buildStageMaterials(meshes) {
  const clay = new THREE.MeshStandardMaterial({ color: 0xb9b4ab, roughness: 0.84, metalness: 0, side: THREE.DoubleSide });
  const wire = new THREE.MeshBasicMaterial({ color: 0x9a9da3, wireframe: true, transparent: true, opacity: 0.55 });
  const normal = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  for (const o of meshes) {
    const orig = o.material;
    o.userData.mats = {
      final: orig, clay, wire, normal,
      detail: orig.normalMap
        ? new THREE.MeshStandardMaterial({ color: 0xb9b4ab, roughness: 0.8, metalness: 0, normalMap: orig.normalMap, aoMap: orig.aoMap || null, side: THREE.DoubleSide })
        : clay,
      tex: orig.map ? new THREE.MeshBasicMaterial({ map: orig.map, side: THREE.DoubleSide }) : clay,
    };
  }
}
export function applyStage(meshes, stage) {
  for (const o of meshes) if (o.userData.mats?.[stage]) o.material = o.userData.mats[stage];
}

// Čárový výkres: hrany + neprůhledná výplň, která zakryje neviditelné čáry.
export function buildDrawing(meshes, { ink = 0xc9c7c2, fill = 0x0e0f11, angle = 24 } = {}) {
  const fillMat = new THREE.MeshBasicMaterial({ color: fill, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const lineMats = new Map();
  for (const o of meshes) {
    const lm = new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, angle), lm);
    edges.userData.isEdge = true;
    o.add(edges);
    o.userData.fillMat = fillMat;
    lineMats.set(o, lm);
  }
  return { fillMat, lineMats };
}

// Směry rozložení: od středu sestavy, úměrně velikosti. Vrací posun v lokálních souřadnicích rodiče.
export function computeExplode(meshes, size) {
  const reach = size.length() * 0.22;
  for (const o of meshes) {
    const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const dir = c.clone(); dir.y *= 1.6;
    if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
    dir.normalize().multiplyScalar(reach);
    const inv = new THREE.Matrix4().copy(o.parent.matrixWorld).invert();
    const p0 = o.getWorldPosition(new THREE.Vector3());
    o.userData.home = o.position.clone();
    o.userData.away = p0.add(dir).applyMatrix4(inv).sub(o.position);
  }
}
export function setExplode(meshes, t) {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  for (const o of meshes) if (o.userData.home) o.position.copy(o.userData.home).addScaledVector(o.userData.away, e);
}

