// Správa webu: připojení, seznam prací, editor 3D modelu, zveřejnění.
import { createGitHubTarget, createLocalTarget } from "./publish.js";

const DATA = "data/projects.json";
const CATS = { postavy: "Postavy", produkty: "Produkty", prostredi: "Prostředí", jine: "Jiné" };
// výchozí jména z Blenderu a automaticky rozdělené díly — v legendě až po pojmenování
const GENERIC = /^(plane|circle|cube|cylinder|sphere|uv sphere|icosphere|cone|torus|mesh|object|bezier|curve|text|díl \d+|drobné díly)\b/i;
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isLocalHost = ["localhost", "127.0.0.1"].includes(location.hostname);

let target = null;
let data = { version: 1, works: [] };
let selected = null;
let orderDirty = false;
let preview = null;

/* ================= připojení ================= */
const store = {
  get(k) { try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; } },
  set(k, v, persist) { try { (persist ? localStorage : sessionStorage).setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch {} },
};

function initConnect() {
  $("#tab-local").hidden = !isLocalHost;
  for (const k of ["owner", "repo", "branch"]) { const v = store.get("k3d-" + k); if (v) $("#gh-" + k).value = v; }
  const tok = store.get("k3d-token"); if (tok) $("#gh-token").value = tok;
  $("#gh-remember").checked = (() => { try { return !!localStorage.getItem("k3d-token"); } catch { return false; } })();

  $("#target-tabs").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    $("#target-tabs").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("#gh-form").hidden = b.dataset.target !== "github";
    $("#local-form").hidden = b.dataset.target !== "local";
  });
  if (isLocalHost && !tok) $("#tab-local").click();

  $("#gh-form").addEventListener("submit", async e => {
    e.preventDefault();
    const cfg = { owner: $("#gh-owner").value.trim(), repo: $("#gh-repo").value.trim(), branch: $("#gh-branch").value.trim(), token: $("#gh-token").value.trim() };
    const st = $("#gh-status"); st.className = "status"; st.textContent = "Ověřuji…";
    try {
      const t = createGitHubTarget(cfg);
      const r = await t.test();
      const remember = $("#gh-remember").checked;
      for (const k of ["owner", "repo", "branch"]) store.set("k3d-" + k, cfg[k], true);
      store.del("k3d-token"); store.set("k3d-token", cfg.token, remember);
      await connected(t, r.detail.replace(/^Připojeno k /, "").replace(/\.$/, ""), r.detail);
    } catch (err) { st.className = "status bad"; st.textContent = err.message; }
  });
  $("#local-go").addEventListener("click", async () => {
    const st = $("#local-status"); st.className = "status"; st.textContent = "Připojuji…";
    try { const t = createLocalTarget({ base: new URL("../", location.href).pathname }); await t.test(); await connected(t, "místní test · tento počítač", "Místní server"); }
    catch (err) { st.className = "status bad"; st.textContent = err.message + " Spusť dev_server.py."; }
  });
  $("#disconnect").addEventListener("click", () => { store.del("k3d-token"); location.reload(); });
}

async function connected(t, where) {
  target = t;
  data = (await target.readJSON(DATA)) || { version: 1, works: [] };
  data.works ||= [];
  $("#connect").hidden = true; $("#workspace").hidden = false;
  $("#pill").classList.add("on"); $("#pill-text").textContent = t.kind === "github" ? "GitHub" : "Místní test";
  $("#ws-where").textContent = where;
  renderList();
}

/* ================= seznam ================= */
const asset = (p, rev) => p ? `../${p}${rev ? `?v=${rev}` : ""}` : "";

function renderList() {
  const ul = $("#list");
  $("#count").textContent = data.works.length;
  if (!data.works.length) { ul.innerHTML = `<li class="empty" style="display:block;cursor:default">Zatím žádná práce.</li>`; return; }
  ul.innerHTML = data.works.map((w, i) => `
    <li data-id="${esc(w.id)}" class="${selected === w.id ? "sel" : ""}" tabindex="0">
      <span class="th" style="background-image:url('${esc(asset(w.cover, w.rev))}')"></span>
      <span><span class="t">${esc(w.title)}</span><br><span class="m">${esc(CATS[w.category] || "")} · ${esc(w.year || "")}</span>
        ${w.featured ? ' <span class="badge star">hlavní</span>' : ""}</span>
      <span class="ord"><button type="button" data-mv="-1" aria-label="Posunout výš" ${i === 0 ? "disabled" : ""}>▲</button><button type="button" data-mv="1" aria-label="Posunout níž" ${i === data.works.length - 1 ? "disabled" : ""}>▼</button></span>
    </li>`).join("") + (orderDirty ? `<li style="display:block;cursor:default"><button class="btn btn-sm btn-accent" type="button" id="save-order">Uložit pořadí</button></li>` : "");
}
$("#list").addEventListener("click", async e => {
  if (e.target.id === "save-order") {
    e.target.disabled = true;
    try { await commit([], "Pořadí prací"); orderDirty = false; renderList(); } catch (err) { alert(err.message); e.target.disabled = false; }
    return;
  }
  const li = e.target.closest("li[data-id]"); if (!li) return;
  const mv = e.target.closest("[data-mv]");
  if (mv) {
    const i = data.works.findIndex(w => w.id === li.dataset.id), j = i + +mv.dataset.mv;
    [data.works[i], data.works[j]] = [data.works[j], data.works[i]];
    orderDirty = true; renderList(); return;
  }
  openEditor(data.works.find(w => w.id === li.dataset.id));
});
$("#list").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("li[data-id]")) e.target.click(); });
$("#new-model").addEventListener("click", () => openEditor({ type: "model" }));

/* ================= společné pro editory ================= */
function slug(s) {
  const base = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "prace";
  let id = base, n = 2;
  while (data.works.some(w => w.id === id)) id = `${base}-${n++}`;
  return id;
}
function fillCommon(root, w) {
  const f = n => root.querySelector(`[data-f="${n}"]`);
  f("category").innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  f("title").value = w.title || "";
  f("category").value = w.category || "produkty";
  f("year").value = w.year || new Date().getFullYear();
  f("description").value = w.description || "";
  if (w.id) { f("heading").textContent = w.title; f("idtag").textContent = w.id; f("delete").hidden = false; f("save").textContent = "Uložit změny"; }
  return f;
}
function readCommon(f) {
  const title = f("title").value.trim();
  if (!title) { f("title").focus(); throw new Error("Doplň název."); }
  return { title, category: f("category").value, year: +f("year").value || new Date().getFullYear(), description: f("description").value.trim() };
}
function wireDrop(drop, input, onFiles) {
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => input.files.length && onFiles([...input.files]));
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
}
async function commit(files, message, onProgress) {
  data.updated = new Date().toISOString();
  const json = JSON.stringify(data, null, 2) + "\n";
  return target.commit([...files, { path: DATA, content: json }], message, onProgress);
}
function progressText(st) { return p => { st.textContent = p.total ? `Nahrávám ${p.done}/${p.total}…` : "Nahrávám…"; }; }
async function removeWork(w, st) {
  if (!confirm(`Opravdu smazat „${w.title}“? Soubory zmizí z webu.`)) return;
  const files = [w.model, w.cover, w.lines, ...(w.images || []).flatMap(im => [im.src, im.sm])].filter(Boolean).map(p => ({ path: p, content: null }));
  const idx = data.works.indexOf(w);
  data.works.splice(idx, 1);
  try { await commit(files, `Smazána práce: ${w.title}`, progressText(st)); selected = null; renderList(); showEmpty(); }
  catch (err) { data.works.splice(idx, 0, w); st.className = "status bad"; st.textContent = err.message; }
}
function showEmpty() {
  preview?.dispose(); preview = null;
  $("#editor").innerHTML = `<div class="panel"><div class="empty">Hotovo. Vyber další práci nebo přidej novou.</div></div>`;
}

function openEditor(w) {
  if (orderDirty && !confirm("Pořadí není uložené. Pokračovat bez uložení?")) return;
  if (orderDirty) { orderDirty = false; target.readJSON(DATA).then(d => { if (d) { data = d; renderList(); } }); }
  selected = w.id || null; renderList();
  preview?.dispose(); preview = null;
  modelEditor(w);
}

/* ================= editor 3D modelu ================= */
async function modelEditor(w) {
  const ed = $("#editor");
  ed.replaceChildren($("#tpl-model").content.cloneNode(true));
  const f = fillCommon(ed, w);
  f("featured").checked = !!w.featured;
  let pending = null;             // { glb, report, url, cover, lines }
  let parts = (w.parts || []).map(p => ({ ...p }));
  let info = null;
  // rendery: uložené { src, sm, w, h } nebo nové { big, small, url }
  let images = (w.images || []).map(im => ({ ...im }));
  const removedImages = [];

  function renderImgs() {
    f("imgs").innerHTML = images.map((im, i) => `
      <figure class="${im.big ? "new" : ""}" style="background-image:url('${esc(im.url || asset(im.sm, w.rev))}')">
        ${i === 0 ? "<figcaption>náhled</figcaption>" : ""}
        <span class="ctl">
          <button type="button" data-im="left" data-i="${i}" aria-label="Posunout doleva" ${i === 0 ? "hidden" : ""}>←</button>
          <button type="button" data-im="right" data-i="${i}" aria-label="Posunout doprava" ${i === images.length - 1 ? "hidden" : ""}>→</button>
          <button type="button" data-im="del" data-i="${i}" aria-label="Odebrat">✕</button>
        </span>
      </figure>`).join("");
  }
  renderImgs();
  f("imgs").addEventListener("click", e => {
    const b = e.target.closest("button[data-im]"); if (!b) return;
    const i = +b.dataset.i;
    if (b.dataset.im === "del") { const [im] = images.splice(i, 1); if (im.src) removedImages.push(im); }
    else { const j = i + (b.dataset.im === "left" ? -1 : 1); [images[i], images[j]] = [images[j], images[i]]; }
    renderImgs();
  });
  wireDrop(f("img-drop"), f("img-file"), async files => {
    const st = f("status"); st.className = "status";
    const list = files.filter(x => x.type.startsWith("image/"));
    const { processImage } = await import("./process.js");
    for (const [n, file] of list.entries()) {
      st.textContent = `Převádím render ${n + 1}/${list.length}…`;
      const big = await processImage(file, 2400), small = await processImage(file, 900);
      images.push({ big, small, url: URL.createObjectURL(file) });
      renderImgs();
    }
    st.textContent = "";
  });

  if (w.id) {
    // existující model: nahoře rovnou náhled a popisky, výměna souboru až na požádání
    f("drop-title").textContent = "Nahradit model — přetáhni nový .glb";
    f("drop-wrap").hidden = true;
    f("replace").hidden = false;
    f("replace").addEventListener("click", () => { f("drop-wrap").hidden = false; f("drop-wrap").scrollIntoView({ behavior: "smooth", block: "center" }); f("file").click(); });
    await showModel(asset(w.model, w.rev), w.stats, w.stages, w.bytes);
  }

  wireDrop(f("drop"), f("file"), async files => {
    const file = files.find(x => /\.glb$/i.test(x.name));
    const log = f("log"); log.hidden = false; log.innerHTML = "";
    const line = (t, cls = "now") => { log.querySelectorAll(".now").forEach(x => x.className = "done"); const d = document.createElement("div"); d.className = cls; d.textContent = t; log.append(d); };
    if (!file) { line("Tohle není soubor .glb. V Blenderu: File → Export → glTF 2.0 → glTF Binary.", "err"); return; }
    if (!f("title").value) f("title").value = file.name.replace(/\.glb$/i, "").replace(/[_-]+/g, " ").replace(/^./, c => c.toUpperCase());
    try {
      const { processModel } = await import("./process.js");
      const { glb, report } = await processModel(await file.arrayBuffer(), { onStep: line });
      line(`Hotovo: ${kb(report.bytesIn)} → ${kb(report.bytesOut)}`, "done");
      if (report.split) line(`Model byl jeden kus — rozdělen na ${report.partsFound} dílů${report.merged ? ` (${report.merged} drobností sloučeno)` : ""}.`, "done");
      for (const t of report.textures) if (t.to !== t.from || t.after !== t.before) line(`Textura ${t.name}: ${t.w}×${t.h}, ${kb(t.before)} → ${kb(t.after)}`, "done");
      for (const wn of report.warnings) line(wn, "warn");
      const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
      line("Vytvářím náhledy…");
      const { makeThumbs } = await import("./thumbs.js");
      const th = await makeThumbs(url);
      log.querySelectorAll(".now").forEach(x => x.className = "done");
      pending = { glb, report, url, ...th };
      await showModel(url, null, null, glb.byteLength);
    } catch (err) {
      console.error(err);
      line("Zpracování selhalo: " + (err.message || err), "err");
    }
  });

  async function showModel(url, stats, stages, bytes) {
    f("result").hidden = false;
    const { Preview } = await import("./preview.js");
    preview?.dispose();
    preview = new Preview(f("preview"));
    info = await preview.load(url);
    stats = info.stats; stages = info.stages;
    // popisky dílů: zachovat, co už kamarád napsal
    const prev = new Map(parts.map(p => [p.key, p]));
    parts = [...info.groups.values()].map(g => prev.get(g.key) || { key: g.key, label: GENERIC.test(g.key) ? "" : g.key, show: !GENERIC.test(g.key) });
    parts.forEach(p => { p.count = info.groups.get(p.key)?.meshes.length || 0; });
    renderParts();
    renderFacts(stats, bytes);
    f("chips").innerHTML = ["wire", "clay", "detail", "tex", "final"].map(s => {
      const on = stages.includes(s);
      const why = { detail: "chybí normálová mapa", tex: "chybí textury", final: "chybí materiály" }[s];
      return `<span class="chip ${on ? "on" : "off"}" title="${on ? "" : why}">${preview.label(s)}${on ? "" : " — " + why}</span>`;
    }).join("");
    f("stages").innerHTML = [...stages, "drawing"].map((s, i) => `<button type="button" data-s="${s}" aria-pressed="${i === 0}">${s === "drawing" ? "Výkres" : preview.label(s)}</button>`).join("");
    preview.setMode(stages[stages.length - 1]);
    f("stages").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.s === stages[stages.length - 1]));
  }
  f("stages").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !preview) return;
    f("stages").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    preview.setMode(b.dataset.s);
  });
  f("explode").addEventListener("click", e => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", on); e.currentTarget.textContent = on ? "Složit" : "Rozložit";
    preview?.explode(on);
  });

  function renderFacts(s, bytes) {
    f("facts").innerHTML = [
      ["Vrcholy", fmtN(s.verts)], ["Trojúhelníky", fmtN(s.tris)], ["Díly", `${s.parts} (${s.shapes} tvarů)`],
      ["Materiály", s.materials || "žádné"], ["Textury", s.textures ? `${s.textures} · ${s.textureSize} px` : "žádné"], ["Velikost", kb(bytes)],
    ].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join("");
  }
  function renderParts() {
    f("parts-wrap").hidden = !parts.length;
    f("parts").innerHTML = parts.map((p, i) => `
      <tr data-key="${esc(p.key)}">
        <td class="mono">${i + 1}</td>
        <td class="key">${esc(p.key)}</td>
        <td><input type="text" value="${esc(p.label)}" placeholder="${GENERIC.test(p.key) ? "bez popisku" : esc(p.key)}" data-i="${i}" maxlength="40" aria-label="Popisek dílu ${esc(p.key)}"></td>
        <td><input type="checkbox" ${p.show ? "checked" : ""} data-c="${i}" aria-label="Ukázat v legendě"></td>
        <td class="mono">${p.count || ""}</td>
      </tr>`).join("");
  }
  f("parts").addEventListener("input", e => {
    if (e.target.dataset.i != null) { const p = parts[+e.target.dataset.i]; p.label = e.target.value; if (p.label && !p.show) { p.show = true; renderParts(); f("parts").querySelector(`[data-i="${e.target.dataset.i}"]`).focus(); } }
    if (e.target.dataset.c != null) parts[+e.target.dataset.c].show = e.target.checked;
  });
  f("parts").addEventListener("mouseover", e => { const tr = e.target.closest("tr"); if (tr) { f("parts").querySelectorAll("tr").forEach(x => x.classList.toggle("hot", x === tr)); preview?.highlight(tr.dataset.key); } });
  f("parts").addEventListener("mouseleave", () => { f("parts").querySelectorAll("tr").forEach(x => x.classList.remove("hot")); preview?.highlight(null); });
  f("parts").addEventListener("focusin", e => { const tr = e.target.closest("tr"); if (tr) preview?.highlight(tr.dataset.key); });

  f("delete").addEventListener("click", () => removeWork(w, f("status")));
  f("save").addEventListener("click", async () => {
    const st = f("status"); st.className = "status";
    try {
      const common = readCommon(f);
      if (!w.id && !pending) throw new Error("Nejdřív přetáhni model (.glb).");
      if (!info) throw new Error("Model se ještě zpracovává.");
      const isNew = !w.id;
      const id = w.id || slug(common.title);
      const rev = Date.now().toString(36);
      const entry = isNew ? { id, type: "model" } : w;
      Object.assign(entry, common, {
        featured: f("featured").checked,
        parts: parts.map(({ key, label, show, count }) => ({ key, label: label.trim(), show: !!show && !!(label.trim() || !GENERIC.test(key)), count })),
      });
      const files = [];
      if (pending) {
        const ext = t => t === "image/webp" ? "webp" : "jpg";
        const oldPaths = [entry.model, entry.cover, entry.lines];
        Object.assign(entry, {
          model: `models/${id}.glb`, cover: `thumbs/${id}.${ext(pending.cover.type)}`, lines: `thumbs/${id}-lines.${ext(pending.lines.type)}`,
          stages: info.stages, stats: { ...info.stats, generator: blenderVersion(pending.report.generator) || (/gltf-transform/i.test(pending.report.generator) ? "" : pending.report.generator) }, bytes: pending.glb.byteLength, rev,
        });
        files.push({ path: entry.model, content: pending.glb }, { path: entry.cover, content: pending.cover.bytes }, { path: entry.lines, content: pending.lines.bytes });
        for (const p of oldPaths) if (p && !files.some(x => x.path === p)) files.push({ path: p, content: null });
      }
      // rendery: nové nahrát, odebrané smazat, pořadí podle mřížky
      const ext = t => t === "image/webp" ? "webp" : "jpg";
      const stamp = Date.now().toString(36);
      entry.images = images.map((im, i) => {
        if (!im.big) return { src: im.src, sm: im.sm, w: im.w, h: im.h };
        const src = `images/${id}-${stamp}-${i + 1}.${ext(im.big.type)}`, sm = `images/${id}-${stamp}-${i + 1}-sm.${ext(im.small.type)}`;
        files.push({ path: src, content: im.big.bytes }, { path: sm, content: im.small.bytes });
        return { src, sm, w: im.big.w, h: im.big.h };
      });
      for (const im of removedImages) files.push({ path: im.src, content: null }, { path: im.sm, content: null });
      if (images.some(im => im.big) || removedImages.length) entry.rev = stamp;
      if (entry.featured) data.works.forEach(x => { if (x !== entry) x.featured = false; });
      if (isNew) data.works.unshift(entry);
      st.textContent = "Nahrávám…";
      f("save").disabled = true;
      await commit(files, `${isNew ? "Nový model" : "Úprava"}: ${entry.title}`, progressText(st));
      pending = null;
      images = entry.images.map(im => ({ ...im })); removedImages.length = 0; renderImgs();
      st.className = "status ok";
      st.textContent = target.kind === "github" ? "Zveřejněno. Web se aktualizuje zhruba do minuty." : "Uloženo.";
      selected = id; w = entry; renderList();
      f("heading").textContent = entry.title; f("idtag").textContent = id; f("delete").hidden = false; f("save").textContent = "Uložit změny";
    } catch (err) {
      st.className = "status bad"; st.textContent = err.message;
      if (!w.id) data.works = data.works.filter(x => x.id);   // nic napůl přidaného
      const fresh = await target.readJSON(DATA).catch(() => null); if (fresh) { data = fresh; renderList(); }
    } finally { f("save").disabled = false; }
  });
}

/* ================= pomocné ================= */
// program autora ze souboru; náš kompresní nástroj tam nepatří
function blenderVersion(g) { g = g || ""; const v = g.match(/\bv(\d+\.\d+)/); return /blender/i.test(g) ? ("Blender " + (v ? v[1] : "")).trim() : ""; }
function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " kB"; }
function fmtN(n) { return Math.round(n || 0).toLocaleString("cs-CZ"); }
window.addEventListener("beforeunload", e => { if (orderDirty) { e.preventDefault(); e.returnValue = ""; } });

initConnect();
