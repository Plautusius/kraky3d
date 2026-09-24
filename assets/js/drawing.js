// Stránka projektu: model jako technický výkres — pohledy, očíslované díly, rozložení, hlína/render.
import { THREE, loadModel, analyze, centerModel, buildStageMaterials, applyStage, buildDrawing, computeExplode, setExplode } from "./core.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const INK = 0xc9c7c2, MARK = 0xe8833a, FILL = 0x0e0f11;
const HINT = matchMedia("(pointer: fine)").matches ? "Táhnutím otočíte · Ctrl + kolečko přiblíží" : "Dvěma prsty přiblížíte a otočíte";
const VIEWS = {
  iso:   { az: Math.PI * 1.25, el: 0.52 },
  side:  { az: Math.PI * 1.0, el: 0.0001 },
  front: { az: Math.PI * 1.5, el: 0.0001 },
  top:   { az: Math.PI * 1.0, el: Math.PI / 2 - 0.0001 },
};

export async function boot(work) {
  const drawing = document.getElementById("drawing");
  const svg = document.getElementById("callouts");
  const legend = document.getElementById("legend");
  const statusEl = document.getElementById("status");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute("aria-hidden", "true");
  drawing.querySelector(".poster").after(renderer.domElement);

  // Kolečko samo posouvá stránku; přiblížení jen s Ctrl (⌘). Musí být zaregistrované PŘED OrbitControls.
  let hintTimer = 0;
  renderer.domElement.addEventListener("wheel", e => {
    if (e.ctrlKey || e.metaKey) return;
    e.stopImmediatePropagation();
    statusEl.textContent = "Přiblížení: Ctrl + kolečko, nebo tlačítka + / −";
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { statusEl.textContent = HINT; }, 2200);
  }, { passive: true });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);

  statusEl.textContent = "Načítám model…";
  const gltf = await loadModel(`${work.model}?v=${work.rev}`);
  const info = analyze(gltf);
  const root = gltf.scene;
  const { size, radius } = centerModel(root);
  scene.add(root);
  camera.near = -radius * 20; camera.far = radius * 20;

  buildStageMaterials(info.meshes);
  const { fillMat, lineMats } = buildDrawing(info.meshes, { ink: INK, fill: FILL });
  computeExplode(info.units, size);
  for (const o of info.meshes) o.material = fillMat;

  // světlo jen pro hlínu a render
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xffffff, 0x1a1b1f, 1.5));
  const kl = new THREE.DirectionalLight(0xfff1e0, 2.2); kl.position.set(3, 5, 4); lights.add(kl);
  const rl = new THREE.DirectionalLight(MARK, 1.1); rl.position.set(-4, 2, -3); lights.add(rl);
  scene.add(lights);
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // díly s popiskem z adminu dostanou číslo
  const labels = new Map((work.parts || []).filter(p => p.show).map((p, i) => [p.key, { no: i + 1, label: p.label || p.key }]));
  const named = [...info.groups.values()].filter(g => labels.has(g.key)).map(g => ({ ...g, ...labels.get(g.key) }));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true; controls.enablePan = false;
  controls.minZoom = 0.6; controls.maxZoom = 8;
  controls.enableDamping = true; controls.dampingFactor = 0.1;
  // dotyk: jeden prst posouvá stránku, dva prsty přibližují a otáčejí
  if (!matchMedia("(pointer: fine)").matches) controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const zoomTo = z => { camera.zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom, z)); camera.updateProjectionMatrix(); kick(); };
  document.getElementById("zoom-in").addEventListener("click", () => zoomTo(camera.zoom * 1.35));
  document.getElementById("zoom-out").addEventListener("click", () => zoomTo(camera.zoom / 1.35));
  document.getElementById("zoom-reset").addEventListener("click", () => zoomTo(1));

  const cur = { az: VIEWS.iso.az, el: VIEWS.iso.el, ex: 0 };
  const want = { ...cur };
  let viewKey = "iso", shade = "line", dragging = false, hot = null;
  const frustum = radius * 1.12;   // místo pro razítko vpravo dole

  function place() {
    const r = radius * 4;
    camera.position.set(r * Math.cos(cur.el) * Math.sin(cur.az), r * Math.sin(cur.el), r * Math.cos(cur.el) * Math.cos(cur.az));
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
  }
  function resize() {
    const el = renderer.domElement, w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    const a = w / h;
    const f = frustum * (a < 1 ? 1 / a : 1) * (1 + 0.35 * cur.ex);
    camera.left = -f * a; camera.right = f * a; camera.top = f; camera.bottom = -f;
    camera.updateProjectionMatrix();
    kick();
  }

  // popisky: bod na dílu + vodicí čára ven od středu výkresu
  const v = new THREE.Vector3();
  const project = p => { v.copy(p).project(camera); const el = renderer.domElement; return [(v.x + 1) / 2 * el.clientWidth, (1 - v.y) / 2 * el.clientHeight]; };
  function drawCallouts() {
    const el = renderer.domElement, W = el.clientWidth, H = el.clientHeight, cx = W / 2, cy = H / 2;
    let out = "";
    for (const g of named) {
      const [x, y] = project(new THREE.Box3().setFromObject(g.units[0]).getCenter(new THREE.Vector3()));
      let dx = x - cx, dy = y - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const reach = Math.min(W, H) * 0.16;
      const tx = Math.max(22, Math.min(W - 22, x + dx * reach)), ty = Math.max(70, Math.min(H - 70, y + dy * reach));
      out += `<g class="${hot === g.key ? "hot" : ""}"><line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}"/><circle class="dot" cx="${x}" cy="${y}" r="2.5"/><g class="tag"><circle cx="${tx}" cy="${ty}" r="11"/><text x="${tx}" y="${ty}">${g.no}</text></g></g>`;
    }
    // kóta celkové délky v bočním pohledu (jednotky Blenderu = metry)
    if (viewKey === "side" && cur.ex < 0.02) {
      const b = new THREE.Box3().setFromObject(root);
      const a = project(new THREE.Vector3(b.min.x, b.min.y, 0)), c = project(new THREE.Vector3(b.max.x, b.min.y, 0));
      const yy = a[1] + 34, len = (b.max.x - b.min.x).toFixed(2).replace(".", ",");
      out += `<g class="dim"><line x1="${a[0]}" y1="${a[1] + 6}" x2="${a[0]}" y2="${yy + 6}"/><line x1="${c[0]}" y1="${c[1] + 6}" x2="${c[0]}" y2="${yy + 6}"/><line x1="${a[0]}" y1="${yy}" x2="${c[0]}" y2="${yy}" marker-start="url(#ar)" marker-end="url(#ar)"/><text x="${(a[0] + c[0]) / 2}" y="${yy - 6}">${len} m</text></g>`;
    }
    svg.innerHTML = `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,2 L10,5 L0,8" fill="none" stroke="rgba(163,165,169,.8)"/></marker></defs>` + out;
  }

  function setHot(key) {
    hot = key;
    const hotMeshes = new Set(key ? info.groups.get(key)?.meshes : []);
    for (const [o, lm] of lineMats) lm.color.set(hotMeshes.has(o) ? MARK : INK);
    legend.querySelectorAll("button").forEach(b => b.classList.toggle("hot", b.dataset.g === key));
    kick();
  }
  legend.addEventListener("mouseover", e => { const b = e.target.closest("button"); if (b) setHot(b.dataset.g); });
  legend.addEventListener("mouseleave", () => setHot(null));
  legend.addEventListener("focusin", e => { const b = e.target.closest("button"); if (b) setHot(b.dataset.g); });
  legend.addEventListener("focusout", () => setHot(null));

  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => {
    viewKey = b.dataset.view;
    document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", x === b));
    want.az = VIEWS[viewKey].az; want.el = VIEWS[viewKey].el;
    while (want.az - cur.az > Math.PI) want.az -= Math.PI * 2;     // kratší cestou
    while (cur.az - want.az > Math.PI) want.az += Math.PI * 2;
    kick();
  }));
  document.getElementById("shades").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    shade = b.dataset.shade;
    document.querySelectorAll("[data-shade]").forEach(x => x.setAttribute("aria-pressed", x === b));
    if (shade === "line") for (const o of info.meshes) o.material = fillMat; else applyStage(info.meshes, shade);
    scene.environment = shade === "final" ? env : null;
    lights.visible = shade !== "line";
    renderer.toneMappingExposure = shade === "final" ? 1.05 : 1;
    for (const lm of lineMats.values()) lm.opacity = shade === "line" ? 0.9 : shade === "clay" ? 0.22 : 0;
    kick();
  });
  lights.visible = false;
  const exBtn = document.getElementById("explode");
  exBtn.addEventListener("click", () => {
    const on = exBtn.getAttribute("aria-pressed") !== "true";
    exBtn.setAttribute("aria-pressed", on); exBtn.textContent = on ? "Složit" : "Rozložit";
    want.ex = on ? 1 : 0; kick();
  });

  controls.addEventListener("start", () => { dragging = true; drawing.classList.add("moving"); });
  controls.addEventListener("end", () => {
    dragging = false;
    const off = camera.position.clone();
    cur.el = want.el = Math.asin(off.y / off.length());
    cur.az = want.az = Math.atan2(off.x, off.z);
    viewKey = "free";
    document.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", "false"));
    drawing.classList.remove("moving");
    kick();
  });
  controls.addEventListener("change", kick);   // i přiblížení kolečkem / prsty

  let running = false, visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(drawing);
  function tick() {
    if (!visible || document.hidden) { running = false; return; }
    let moving = dragging;
    if (!dragging) {
      const k = reduce ? 1 : 0.12;
      for (const key of ["az", "el", "ex"]) {
        const d = want[key] - cur[key];
        if (Math.abs(d) > 1e-4) { cur[key] += d * k; moving = true; } else cur[key] = want[key];
      }
      setExplode(info.units, cur.ex);
      place();
      if (moving) resize();
    } else controls.update();
    drawing.classList.toggle("moving", moving);
    renderer.render(scene, camera);
    if (!moving) drawCallouts();
    if (moving) requestAnimationFrame(tick); else running = false;
  }
  function kick() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(tick); } }

  new ResizeObserver(resize).observe(drawing);
  place(); resize();
  drawing.classList.add("ready");
  statusEl.textContent = HINT;
}
