// Lehká část jádra bez three.js — úvodní stránka ji načte hned, 3D až později.

// Vrstvy v pořadí, v jakém model vzniká. `needs` = co musí model obsahovat.
export const STAGES = {
  wire:   { label: "Topologie", hud: "Topologie",               needs: null,
            text: "Síť polygonů rozhoduje, jak se model ohýbá, jak se na něj pokládá textura a jak rychle se vykreslí. Čistá topologie je neviditelná — dokud chybí." },
  clay:   { label: "Tvar",      hud: "Tvar · hlína",            needs: null,
            text: "Bez barev a textur zbývá jen silueta a objem. Takhle se model kontroluje nejpoctivěji: pokud nefunguje v šedé hlíně, nezachrání ho žádný materiál." },
  detail: { label: "Detail",    hud: "Detail · normálová mapa", needs: "normalMap",
            text: "Drobné hrany, sváry a škrábance nejsou v geometrii — jsou zapečené v normálové mapě. Model zůstává lehký, detail zůstává ostrý." },
  tex:    { label: "Textury",   hud: "Textury · albedo",        needs: "map",
            text: "Barva povrchu bez světla a stínu. Opotřebení a stopy používání se malují tam, kde by na skutečném předmětu vznikly." },
  final:  { label: "Světlo a materiál", hud: "Finální render",  needs: "materials",
            text: "Všechny vrstvy dohromady — kov, lak, sklo a světlo, které se od nich odráží." },
};
export const STAGE_ORDER = ["wire", "clay", "detail", "tex", "final"];

// GLTFLoader čistí jména ("Kapota.001" -> "Kapota001"); zrcadlené kopie patří k jednomu dílu.
export function partKey(name) {
  return (name || "Díl").replace(/[._]?\d{3}$/, "").replace(/_/g, " ").trim() || "Díl";
}

export const fmt = n => Math.round(n).toLocaleString("cs-CZ");
export const plural = (n, one, few, many) => n === 1 ? one : (n >= 2 && n <= 4 ? few : many);

// Pomalé připojení / slabé zařízení: 3D se nejdřív nabídne, nestahuje se samo.
export function canAutoload() {
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return false;
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
  return true;
}
export function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
