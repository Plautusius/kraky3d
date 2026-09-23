// Zpracování modelu v prohlížeči: rozdělení na díly, textury do WebP, komprese meshopt.
// Verze glTF-Transform jsou pevné — jinak by se načetly dvě různé kopie jádra.
const V = "4.5.0";
const CDN = "https://cdn.jsdelivr.net/npm";

let libs;
async function loadLibs() {
  if (libs) return libs;
  const [core, ext, fn, mo] = await Promise.all([
    import(`${CDN}/@gltf-transform/core@${V}/+esm`),
    import(`${CDN}/@gltf-transform/extensions@${V}/+esm`),
    import(`${CDN}/@gltf-transform/functions@${V}/+esm`),
    import(`${CDN}/meshoptimizer@0.21.0/+esm`),
  ]);
  await mo.MeshoptEncoder.ready;
  await mo.MeshoptDecoder.ready;
  const io = new core.WebIO()
    .registerExtensions(ext.ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": mo.MeshoptEncoder, "meshopt.decoder": mo.MeshoptDecoder });
  libs = { core, ext, fn, mo, io };
  return libs;
}

// Pole asset.generator z JSON části souboru .glb (např. "Khronos glTF Blender I/O v5.0.21").
function readGenerator(buffer) {
  try {
    const dv = new DataView(buffer);
    const len = dv.getUint32(12, true);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, len))).asset?.generator || "";
  } catch { return ""; }
}

const MAX_PARTS = 24;   // větší počet by legendu i rozložení jen zahltil

/**
 * @param {ArrayBuffer} buffer  původní .glb
 * @param {{ split?: "auto"|"always"|"never", maxTexture?: number, onStep?: (text: string) => void }} opts
 * @returns {Promise<{ glb: Uint8Array, report: object }>}
 */
export async function processModel(buffer, { split = "auto", maxTexture = 2048, onStep = () => {} } = {}) {
  onStep("Načítám nástroje pro zpracování…");
  const { core, ext, fn, mo, io } = await loadLibs();

  onStep("Čtu model…");
  const doc = await io.readBinary(new Uint8Array(buffer));
  const root = doc.getRoot();
  const report = { bytesIn: buffer.byteLength, split: false, partsFound: 0, merged: 0, textures: [], warnings: [] };
  report.generator = readGenerator(buffer);   // knihovna ho přepíše už při čtení — bereme ho přímo z hlavičky GLB

  // --- 1. díly ---
  const meshNodes = root.listNodes().filter(n => n.getMesh());
  report.partsFound = meshNodes.length;
  if (split === "always" || (split === "auto" && meshNodes.length <= 1)) {
    onStep("Model je jeden kus — hledám samostatné části…");
    const made = splitLooseParts(doc, core, meshNodes);
    if (made.parts > 1) { report.split = true; report.partsFound = made.parts; report.merged = made.merged; }
    else report.warnings.push("Model nejde rozdělit — všechno je spojené v jednom kusu. Rozložení nebude k dispozici.");
  }
  if (!root.listMaterials().length) report.warnings.push("Model nemá žádné materiály — web ukáže jen síť a hlínu.");

  // --- 2. textury ---
  const textures = root.listTextures();
  if (textures.length) {
    onStep(`Upravuji textury (${textures.length})…`);
    let webpUsed = false;
    for (const tex of textures) {
      const r = await convertTexture(tex, maxTexture);
      report.textures.push(r);
      if (r.to === "image/webp") webpUsed = true;
    }
    if (webpUsed) doc.createExtension(ext.EXTTextureWebP).setRequired(true);
  }

  // --- 3. úklid a komprese geometrie ---
  onStep("Komprimuji geometrii…");
  await doc.transform(
    fn.dedup(),
    fn.prune({ keepLeaves: false }),
    fn.weld(),
    fn.meshopt({ encoder: mo.MeshoptEncoder, level: "medium" }),
  );

  onStep("Ukládám…");
  const glb = await io.writeBinary(doc);
  report.bytesOut = glb.byteLength;
  return { glb, report };
}

// Rozdělí primitiva na souvislé kusy geometrie. Vrcholy na stejném místě (UV švy) se berou jako spojené.
function splitLooseParts(doc, core, meshNodes) {
  const root = doc.getRoot();
  let parts = 0, merged = 0;
  for (const node of meshNodes) {
    const mesh = node.getMesh();
    const pieces = [];
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== core.Primitive.Mode.TRIANGLES) { pieces.push({ prim, tris: null }); continue; }
      const pos = prim.getAttribute("POSITION");
      const n = pos.getCount();
      const idxAcc = prim.getIndices();
      const idx = idxAcc ? idxAcc.getArray() : Uint32Array.from({ length: n }, (_, i) => i);

      // union-find
      const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
      const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
      const seen = new Map(), v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v);
        const key = `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}`;
        const j = seen.get(key); if (j === undefined) seen.set(key, i); else join(j, i);
      }
      for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t], idx[t + 2]); }

      const comps = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        const r = find(idx[t]);
        if (!comps.has(r)) comps.set(r, []);
        comps.get(r).push(t);
      }
      for (const tris of comps.values()) pieces.push({ prim, idx, tris });
    }
    if (pieces.length <= 1) continue;

    // největší kusy zvlášť, drobnosti (šrouby, nýty…) dohromady
    pieces.sort((a, b) => (b.tris?.length || 0) - (a.tris?.length || 0));
    let keep = pieces.slice(0, MAX_PARTS - 1);
    const rest = pieces.slice(MAX_PARTS - 1);
    if (rest.length === 1) keep.push(rest[0]);
    else if (rest.length > 1) {
      merged = rest.length;
      // sloučit jen kusy ze stejného primitiva; jinak je nechat samostatně
      const byPrim = new Map();
      for (const p of rest) { if (!byPrim.has(p.prim)) byPrim.set(p.prim, { prim: p.prim, idx: p.idx, tris: [], small: true }); if (p.tris) byPrim.get(p.prim).tris.push(...p.tris); }
      keep = keep.concat([...byPrim.values()]);
    }

    let k = 0;
    for (const p of keep) {
      if (!p.tris) continue;
      k++;
      const name = p.small ? "Drobné díly" : `Díl ${k}`;
      const prim = makeSubPrimitive(doc, p.prim, p.idx, p.tris);
      const m = doc.createMesh(name).addPrimitive(prim);
      node.addChild(doc.createNode(name).setMesh(m));
    }
    node.setMesh(null);
    parts += k;
  }
  return { parts, merged };
}

// Nové primitivum jen s vrcholy, které daný kus opravdu používá (jinak by nesedělo ohraničení).
function makeSubPrimitive(doc, src, idx, triStarts) {
  const remap = new Map(); const order = [];
  const newIdx = new Uint32Array(triStarts.length * 3);
  let w = 0;
  for (const t of triStarts) for (let c = 0; c < 3; c++) {
    const old = idx[t + c];
    let ni = remap.get(old);
    if (ni === undefined) { ni = order.length; remap.set(old, ni); order.push(old); }
    newIdx[w++] = ni;
  }
  const prim = doc.createPrimitive().setMaterial(src.getMaterial()).setMode(src.getMode());
  const buffer = doc.getRoot().listBuffers()[0];
  for (const sem of src.listSemantics()) {
    const a = src.getAttribute(sem);
    const size = a.getElementSize();
    const Arr = a.getArray().constructor;
    const out = new Arr(order.length * size);
    const el = new Array(size);
    for (let i = 0; i < order.length; i++) { a.getElement(order[i], el); for (let s = 0; s < size; s++) out[i * size + s] = el[s]; }
    prim.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(out).setNormalized(a.getNormalized()).setBuffer(buffer));
  }
  const IdxArr = order.length > 65535 ? Uint32Array : Uint16Array;
  prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(IdxArr.from(newIdx)).setBuffer(buffer));
  return prim;
}

// Zmenší texturu a převede ji do WebP. Když prohlížeč WebP neumí zapsat (Safari), zůstane původní formát.
async function convertTexture(tex, max) {
  const from = tex.getMimeType();
  const img = tex.getImage();
  const r = { name: tex.getName() || tex.getURI() || "textura", from, to: from, w: 0, h: 0, before: img?.byteLength || 0, after: img?.byteLength || 0 };
  if (!img || /ktx2/.test(from)) return r;
  const bmp = await createImageBitmap(new Blob([img], { type: from }));
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  r.w = w; r.h = h;
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = cv.getContext("2d");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = (type, q) => cv.convertToBlob ? cv.convertToBlob({ type, quality: q }) : new Promise(res => cv.toBlob(res, type, q));
  let blob = await toBlob("image/webp", 0.88);
  if (!blob || blob.type !== "image/webp") {
    if (s === 1) return r;                         // nic by se nezlepšilo
    blob = await toBlob(from === "image/png" ? "image/png" : "image/jpeg", 0.9);
  }
  const out = new Uint8Array(await blob.arrayBuffer());
  if (out.byteLength >= r.before && s === 1) return r;  // převod by soubor zvětšil
  tex.setImage(out).setMimeType(blob.type);
  if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.\w+$/, blob.type === "image/webp" ? ".webp" : blob.type === "image/png" ? ".png" : ".jpg"));
  r.to = blob.type; r.after = out.byteLength;
  return r;
}

// Render modelu -> WebP v zadané šířce (velký pro promítání, malý pro galerii a náhled).
export async function processImage(file, maxWidth) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxWidth / bmp.width);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = Object.assign(document.createElement("canvas"), { width: w, height: h });
  cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let blob = await new Promise(res => cv.toBlob(res, "image/webp", 0.86));
  if (!blob || blob.type !== "image/webp") blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.88));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type, w, h };
}
