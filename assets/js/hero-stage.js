// 3D v úvodu: hlavní model v jednom "viewportu", vrstvy přepíná scrollování i tlačítka.
import { THREE, loadModel, analyze, centerModel, buildStageMaterials, applyStage } from "./core.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// vzdálenost (násobek) a úhel kamery pro každou vrstvu
const SHOTS = { final: [1.0, 1.35], wire: [0.92, 1.2], clay: [1.02, 1.45], detail: [0.8, 1.3], tex: [0.95, 1.5] };

export async function boot(work) {
  const stageEl = document.getElementById("stage");
  const loaderText = document.getElementById("loader-text");
  const loaderBar = document.getElementById("loader-bar");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  const renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute("aria-hidden", "true");
  stageEl.querySelector(".poster").after(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1e0, 1.6); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xe8833a, 1.1); rim.position.set(-4, 2, -4); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;              // kolečko musí posouvat stránku
  controls.enablePan = false;
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.7;
  controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.55;
  controls.minPolarAngle = 0.55; controls.maxPolarAngle = 2.1;
  controls.enabled = matchMedia("(pointer: fine)").matches;   // na dotyku táhnutí scrolluje

  loaderText.textContent = "Načítám model…";
  const gltf = await loadModel(`${work.model}${work.rev ? `?v=${work.rev}` : ""}`, e => {
    if (e.total) loaderBar.style.width = (e.loaded / e.total * 100).toFixed(0) + "%";
  });
  const info = analyze(gltf);
  const root = gltf.scene;
  const { radius } = centerModel(root);
  scene.add(root);
  buildStageMaterials(info.meshes);
  camera.near = radius / 100; camera.far = radius * 100;

  const sph = new THREE.Spherical();
  const want = { r: 1, phi: 1.35 };
  let baseDist = radius * 3;
  camera.position.set(-baseDist * 0.7, baseDist * 0.3, -baseDist * 0.7);

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    baseDist = radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.08;
    camera.updateProjectionMatrix();
    kick();
  }
  function setStage(mode) {
    stageEl.classList.add("swap");
    setTimeout(() => { applyStage(info.meshes, mode); stageEl.classList.remove("swap"); kick(); }, reduce ? 0 : 120);
    const s = SHOTS[mode] || SHOTS.final; want.r = s[0]; want.phi = s[1];
    kick();
  }
  window.__stageSet = setStage;

  // kreslit jen když je vidět a něco se hýbe
  let visible = true, running = false, dragging = false;
  controls.addEventListener("start", () => { dragging = true; kick(); });
  controls.addEventListener("end", () => { dragging = false; });
  controls.addEventListener("change", kick);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(stageEl);
  document.addEventListener("visibilitychange", kick);
  function tick() {
    if (!visible || document.hidden) { running = false; return; }
    let moving = controls.autoRotate || dragging;
    if (!dragging) {
      sph.setFromVector3(camera.position.clone().sub(controls.target));
      const dr = baseDist * want.r - sph.radius, dp = want.phi - sph.phi, k = reduce ? 1 : 0.06;
      if (Math.abs(dr) > radius * 1e-3 || Math.abs(dp) > 1e-3) {
        sph.radius += dr * k; sph.phi += dp * k; moving = true;
        camera.position.setFromSpherical(sph).add(controls.target);
      }
    }
    moving = controls.update() || moving;
    renderer.render(scene, camera);
    if (moving) requestAnimationFrame(tick); else running = false;
  }
  function kick() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(tick); } }

  new ResizeObserver(resize).observe(stageEl);
  resize();
  applyStage(info.meshes, window.__stageMode || info.stages[info.stages.length - 1]);
  setStage(window.__stageMode || info.stages[info.stages.length - 1]);
  requestAnimationFrame(() => stageEl.classList.add("ready"));
}
