// Náhled modelu v adminu: stejné vrstvy a výkres, jaké pak ukáže web.
import { THREE, STAGES, loadModel, analyze, centerModel, buildStageMaterials, applyStage, buildDrawing, computeExplode, setExplode } from "../assets/js/core.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export class Preview {
  constructor(el) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xfff1e0, 1.4); key.position.set(3, 4, 5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8833a, 1.0); rim.position.set(-4, 2, -4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.addEventListener("change", () => this.kick());
    this.ex = 0; this.exWant = 0; this.running = false;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
  }
  label(s) { return STAGES[s]?.label || s; }

  async load(url) {
    const gltf = await loadModel(url);
    const info = analyze(gltf);
    this.info = info;
    this.root = gltf.scene;
    const { size, radius } = centerModel(this.root);
    this.radius = radius;
    this.scene.add(this.root);
    buildStageMaterials(info.meshes);
    this.drawing = buildDrawing(info.meshes, { ink: 0xc9c7c2, fill: 0x0e0f11 });
    computeExplode(info.units, size);
    this.camera.near = radius / 100; this.camera.far = radius * 100;
    const d = radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05;
    this.camera.position.set(-d * 0.62, d * 0.38, -d * 0.68);
    this.controls.target.set(0, 0, 0);
    this.resize();
    return info;
  }
  setMode(mode) {
    this.currentMode = mode;
    const draw = mode === "drawing";
    for (const o of this.info.meshes) {
      if (draw) o.material = o.userData.fillMat; else applyStage([o], mode);
      o.children.forEach(c => { if (c.userData.isEdge) c.visible = draw; });
    }
    this.kick();
  }
  highlight(key) {
    for (const [o, lm] of this.drawing.lineMats) {
      const hot = key && this.info.groups.get(key)?.meshes.includes(o);
      lm.color.set(hot ? 0xe8833a : 0xc9c7c2);
      o.children.forEach(c => { if (c.userData.isEdge && hot) c.visible = true; });
    }
    if (!key) this.setMode(this.currentMode || "drawing");
    this.kick();
  }
  explode(on) { this.exWant = on ? 1 : 0; this.kick(); }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.kick();
  }
  kick() { if (!this.running && !this.disposed) { this.running = true; requestAnimationFrame(() => this.tick()); } }
  tick() {
    if (this.disposed) return;
    let moving = this.controls.update();
    const d = this.exWant - this.ex;
    if (Math.abs(d) > 1e-3) { this.ex += d * 0.12; moving = true; } else this.ex = this.exWant;
    if (this.info) setExplode(this.info.units, this.ex);
    this.renderer.render(this.scene, this.camera);
    if (moving) requestAnimationFrame(() => this.tick()); else this.running = false;
  }
  dispose() {
    this.disposed = true; this.ro.disconnect(); this.controls.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
