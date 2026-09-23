// publish.js — cíle publikace (GitHub / lokální dev server) se stejným rozhraním

const GITHUB_API = "https://api.github.com";

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Převod chybové odpovědi GitHubu na český text
function ghErrorMessage(status) {
  switch (status) {
    case 401:
      return "Token je neplatný nebo vypršel.";
    case 403:
      return "Token nemá oprávnění zapisovat do tohoto repozitáře (potřeba Contents: Read and write).";
    case 404:
      return "Repozitář nebo větev neexistuje.";
    default:
      return `GitHub vrátil chybu (${status}).`;
  }
}

async function ghFetch(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error("Nepodařilo se spojit s GitHubem.");
  }
  if (!res.ok) {
    throw new Error(ghErrorMessage(res.status));
  }
  return res;
}

// Kóduje Uint8Array do base64 po částech, aby nepřetekl zásobník na velkých souborech
function bytesToBase64(bytes) {
  const CHUNK = 0x8000; // 32 KB
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function toBase64(content) {
  if (content instanceof Uint8Array) {
    return bytesToBase64(content);
  }
  // řetězec -> UTF-8 bajty -> base64
  const bytes = new TextEncoder().encode(content);
  return bytesToBase64(bytes);
}

const MAX_GITHUB_FILE_BYTES = 50 * 1024 * 1024;

export function createGitHubTarget({ owner, repo, branch = "main", token }) {
  const repoUrl = `${GITHUB_API}/repos/${owner}/${repo}`;

  async function test() {
    const res = await ghFetch(repoUrl, { headers: ghHeaders(token) });
    const data = await res.json();
    if (!data.permissions || data.permissions.push !== true) {
      throw new Error("Token nemá oprávnění zapisovat do tohoto repozitáře (potřeba Contents: Read and write).");
    }
    // ověření, že větev existuje
    await ghFetch(`${repoUrl}/branches/${encodeURIComponent(branch)}`, { headers: ghHeaders(token) });
    return { ok: true, detail: `Připojeno k ${owner}/${repo} (${branch}).` };
  }

  async function readJSON(path) {
    let res;
    try {
      res = await fetch(`${repoUrl}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
        headers: ghHeaders(token),
        cache: "no-store", // jinak by admin po zveřejnění četl starý seznam
      });
    } catch {
      throw new Error("Nepodařilo se spojit s GitHubem.");
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(ghErrorMessage(res.status));
    const data = await res.json();
    if (data.encoding !== "base64") {
      throw new Error("Neočekávané kódování odpovědi z GitHubu.");
    }
    // base64 -> bajty -> UTF-8, aby přežila diakritika
    const binary = atob(data.content.replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const text = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(text);
  }

  async function getRef() {
    const res = await ghFetch(`${repoUrl}/git/ref/heads/${encodeURIComponent(branch)}`, {
      headers: ghHeaders(token),
    });
    return res.json();
  }

  async function buildTreeAndCommit(files, message, baseCommitSha, baseTreeSha, blobShas, onProgress, total) {
    const treeEntries = [];
    let done = blobShas.size;
    for (const file of files) {
      if (file.content === null) {
        treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      let sha = blobShas.get(file.path);
      if (!sha) {
        const res = await ghFetch(`${repoUrl}/git/blobs`, {
          method: "POST",
          headers: { ...ghHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ content: toBase64(file.content), encoding: "base64" }),
        });
        const data = await res.json();
        sha = data.sha;
        blobShas.set(file.path, sha);
        done++;
        if (onProgress) onProgress({ step: "blob", done, total });
      }
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha });
    }

    const treeRes = await ghFetch(`${repoUrl}/git/trees`, {
      method: "POST",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    const tree = await treeRes.json();
    if (onProgress) onProgress({ step: "tree", done: total, total });

    const commitRes = await ghFetch(`${repoUrl}/git/commits`, {
      method: "POST",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ message, tree: tree.sha, parents: [baseCommitSha] }),
    });
    const commit = await commitRes.json();
    if (onProgress) onProgress({ step: "commit", done: total, total });
    return commit;
  }

  async function commit(files, message, onProgress) {
    for (const file of files) {
      if (file.content !== null) {
        const size =
          file.content instanceof Uint8Array
            ? file.content.byteLength
            : new TextEncoder().encode(file.content).byteLength;
        if (size > MAX_GITHUB_FILE_BYTES) {
          throw new Error("Soubor je příliš velký pro GitHub (max. 50 MB).");
        }
      }
    }

    const total = files.length;
    const blobShas = new Map();

    let ref = await getRef();
    let baseCommitSha = ref.object.sha;
    const baseCommitRes = await ghFetch(`${repoUrl}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
    let baseCommit = await baseCommitRes.json();
    let baseTreeSha = baseCommit.tree.sha;

    let commitObj = await buildTreeAndCommit(files, message, baseCommitSha, baseTreeSha, blobShas, onProgress, total);

    let patchRes;
    try {
      patchRes = await fetch(`${repoUrl}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commitObj.sha, force: false }),
      });
    } catch {
      throw new Error("Nepodařilo se spojit s GitHubem.");
    }

    if (patchRes.status === 422) {
      // větev se mezitím posunula — znovu načíst ref a zopakovat strom/commit (bloby lze znovu použít)
      ref = await getRef();
      baseCommitSha = ref.object.sha;
      const retryBaseRes = await ghFetch(`${repoUrl}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
      baseCommit = await retryBaseRes.json();
      baseTreeSha = baseCommit.tree.sha;

      commitObj = await buildTreeAndCommit(files, message, baseCommitSha, baseTreeSha, blobShas, onProgress, total);

      patchRes = await fetch(`${repoUrl}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commitObj.sha, force: false }),
      });
    }

    if (!patchRes.ok) {
      throw new Error(ghErrorMessage(patchRes.status));
    }

    return { sha: commitObj.sha, url: `https://github.com/${owner}/${repo}/commit/${commitObj.sha}` };
  }

  return { kind: "github", test, readJSON, commit };
}

export function createLocalTarget({ base = "/" } = {}) {
  const root = base.endsWith("/") ? base : base + "/";

  async function test() {
    let res;
    try {
      res = await fetch(`${root}__save/ping`);
    } catch {
      throw new Error("Nepodařilo se spojit s lokálním serverem.");
    }
    if (!res.ok) throw new Error("Lokální server neodpovídá správně.");
    const data = await res.json();
    if (!data || data.ok !== true) throw new Error("Lokální server neodpovídá správně.");
    return { ok: true, detail: `Připojeno k lokálnímu serveru (${root}).` };
  }

  async function readJSON(path) {
    let res;
    try {
      res = await fetch(root + path);
    } catch {
      throw new Error("Nepodařilo se spojit s lokálním serverem.");
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Lokální server vrátil chybu.");
    return res.json();
  }

  async function commit(files, _message, onProgress) {
    const total = files.length;
    let done = 0;
    for (const file of files) {
      const url = `${root}__save/${file.path}`;
      let res;
      try {
        if (file.content === null) {
          res = await fetch(url, { method: "DELETE" });
        } else {
          const body = file.content instanceof Uint8Array ? file.content : file.content;
          res = await fetch(url, { method: "PUT", body });
        }
      } catch {
        throw new Error("Nepodařilo se spojit s lokálním serverem.");
      }
      if (!res.ok) throw new Error(`Lokální server odmítl soubor ${file.path}.`);
      done++;
      if (onProgress) onProgress({ step: file.content === null ? "delete" : "put", done, total });
    }
    return { sha: "local", url: root };
  }

  return { kind: "local", test, readJSON, commit };
}
