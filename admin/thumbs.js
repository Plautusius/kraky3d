// Náhledy pro výběr prací: "cover" (render nebo hlína) a "lines" (čárový výkres). Obojí WebP.
import { THREE, loadModel, analyze, centerModel, buildStageMaterials, applyStage, buildDrawing } from "../assets/js/core.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const W = 1200, H = 750, BG = 0x141518;

export async function makeThumbs(url) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  try {
    const cover = await shot(renderer, url, "cover");
    const lines = await shot(renderer, url, "lines");
    return { cover, lines };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

async function shot(renderer, url, kind) {
  const gltf = await loadModel(url);
  const info = analyze(gltf);
  const root = gltf.scene;
  const { radius } = centerModel(root);
  const scene = new THREE.Scene();
  scene.add(root);
  const az = Math.PI * 1.25, el = 0.38;
  const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  let camera;

  if (kind === "cover") {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xfff1e0, 1.4); key.position.set(3, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8833a, 1.0); rim.position.set(-4, 2, -4); scene.add(rim);
    buildStageMaterials(info.meshes);
    applyStage(info.meshes, info.stages.includes("final") ? "final" : "clay");
    camera = new THREE.PerspectiveCamera(30, W / H, radius / 100, radius * 100);
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * (W / H));
    const dist = radius / Math.sin(Math.min(THREE.MathUtils.degToRad(30), hFov) / 2) * 1.02;
    camera.position.copy(dir).multiplyScalar(dist);
    renderer.toneMappingExposure = 1.05;
  } else {
    const { fillMat } = buildDrawing(info.meshes, { ink: 0xc9c7c2, fill: BG });
    for (const o of info.meshes) o.material = fillMat;
    const f = radius * 0.62, a = W / H;
    camera = new THREE.OrthographicCamera(-f * a, f * a, f, -f, -radius * 10, radius * 10);
    camera.position.copy(dir).multiplyScalar(radius * 4);
    renderer.toneMappingExposure = 1;
  }
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  const blob = await new Promise(res => renderer.domElement.toBlob(res, "image/webp", 0.86));
  const out = blob && blob.type === "image/webp" ? blob : await new Promise(res => renderer.domElement.toBlob(res, "image/jpeg", 0.88));
  scene.traverse(o => { o.geometry?.dispose?.(); });
  return { bytes: new Uint8Array(await out.arrayBuffer()), type: out.type };
}
