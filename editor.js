// Quaestiones — editor logic
// Two things happen here that don't happen on the public side:
//  1) Reading/writing files straight to your GitHub repo via the GitHub REST API.
//  2) Asking your Cloudflare Worker (which holds your Gemini key) to fetch a
//     source page and/or compile a draft from pasted text.
//
// Settings (owner/repo/branch/token/worker URL) are kept in localStorage on
// YOUR device only — they are never written into the repo or the site.

const LS_KEY = "quaestiones-editor-settings";

const state = {
  slug: "",
  objections: [],
  index: [], // cached data/index.json entries
};

function getSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
function saveSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function setStatus(el, msg, kind = "pending") {
  el.textContent = msg;
  el.className = `status-line ${kind}`;
  el.style.display = msg ? "block" : "none";
}

// ---------- base64 helpers (UTF-8 safe) ----------
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

// ---------- GitHub REST API ----------
function ghApiBase() {
  const s = getSettings();
  return `https://api.github.com/repos/${s.owner}/${s.repo}/contents`;
}
function ghHeaders() {
  const s = getSettings();
  return {
    "Authorization": `token ${s.token}`,
    "Accept": "application/vnd.github+json",
  };
}

async function ghGetFile(path) {
  const s = getSettings();
  const res = await fetch(`${ghApiBase()}/${path}?ref=${encodeURIComponent(s.branch || "main")}`, {
    headers: ghHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { sha: data.sha, content: base64ToUtf8(data.content.replace(/\n/g, "")) };
}

async function ghPutFile(path, contentStr, message) {
  const s = getSettings();
  const existing = await ghGetFile(path);
  const body = {
    message,
    content: utf8ToBase64(contentStr),
    branch: s.branch || "main",
  };
  if (existing) body.sha = existing.sha;
  const res = await fetch(`${ghApiBase()}/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------- Worker (AI) calls ----------
async function workerFetchPage(url) {
  const s = getSettings();
  const res = await fetch(s.workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "fetchPage", url }),
  });
  if (!res.ok) throw new Error(`Worker fetchPage failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.text || "";
}

async function workerCompile(prompt, sourceText) {
  const s = getSettings();
  const res = await fetch(s.workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "compile", prompt, sourceText }),
  });
  if (!res.ok) throw new Error(`Worker compile failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.text || "";
}

// ---------- objections list rendering ----------
function renderObjections() {
  const wrap = document.getElementById("objections-wrap");
  wrap.innerHTML = state.objections.map((o, i) => `
    <div class="objection-editor" data-idx="${i}">
      <div class="obj-num">Objection ${i + 1}</div>
      <div class="field">
        <label>Objection text</label>
        <textarea data-field="objection">${o.objection || ""}</textarea>
      </div>
      <div class="field">
        <label>Reply</label>
        <textarea data-field="reply">${o.reply || ""}</textarea>
      </div>
      <div class="field">
        <label>Sources (one per line)</label>
        <textarea data-field="sources">${(o.sources || []).join("\n")}</textarea>
      </div>
      <button class="btn small secondary" data-remove="${i}">Remove objection</button>
    </div>
  `).join("") || `<p class="hint">No objections yet. Add one below.</p>`;

  wrap.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.objections.splice(Number(btn.dataset.remove), 1);
      syncObjectionsFromDom(); // keep any unsaved edits in other rows
      renderObjections();
    });
  });
  wrap.querySelectorAll("textarea").forEach(t => {
    t.addEventListener("input", () => {
      const idx = Number(t.closest(".objection-editor").dataset.idx);
      state.objections[idx][t.dataset.field] = t.dataset.field === "sources"
        ? t.value.split("\n").map(s => s.trim()).filter(Boolean)
        : t.value;
    });
  });
}

function syncObjectionsFromDom() {
  document.querySelectorAll("#objections-wrap .objection-editor").forEach(row => {
    const idx = Number(row.dataset.idx);
    if (!state.objections[idx]) return;
    row.querySelectorAll("textarea").forEach(t => {
      state.objections[idx][t.dataset.field] = t.dataset.field === "sources"
        ? t.value.split("\n").map(s => s.trim()).filter(Boolean)
        : t.value;
    });
  });
}

// ---------- form <-> teaching object ----------
function formToTeaching() {
  syncObjectionsFromDom();
  return {
    slug: document.getElementById("f-slug").value.trim(),
    title: document.getElementById("f-title").value.trim(),
    category: document.getElementById("f-category").value.trim(),
    question: document.getElementById("f-question").value.trim(),
    teaching: document.getElementById("f-teaching").value.trim(),
    why: document.getElementById("f-why").value.trim(),
    objections: state.objections.map((o, i) => ({ id: i + 1, ...o })),
    furtherSources: document.getElementById("f-further").value
      .split("\n").map(s => s.trim()).filter(Boolean),
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
}

function teachingToForm(t) {
  document.getElementById("f-slug").value = t.slug || "";
  document.getElementById("f-title").value = t.title || "";
  document.getElementById("f-category").value = t.category || "";
  document.getElementById("f-question").value = t.question || "";
  document.getElementById("f-teaching").value = t.teaching || "";
  document.getElementById("f-why").value = t.why || "";
  document.getElementById("f-further").value = (t.furtherSources || []).join("\n");
  state.objections = (t.objections || []).map(o => ({
    objection: o.objection || "", reply: o.reply || "", sources: o.sources || [],
  }));
  renderObjections();
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ---------- wire up on load ----------
window.addEventListener("DOMContentLoaded", () => {
  // settings panel
  const s = getSettings();
  document.getElementById("s-owner").value = s.owner || "";
  document.getElementById("s-repo").value = s.repo || "";
  document.getElementById("s-branch").value = s.branch || "main";
  document.getElementById("s-token").value = s.token || "";
  document.getElementById("s-worker").value = s.workerUrl || "";

  document.getElementById("save-settings").addEventListener("click", () => {
    saveSettings({
      owner: document.getElementById("s-owner").value.trim(),
      repo: document.getElementById("s-repo").value.trim(),
      branch: document.getElementById("s-branch").value.trim() || "main",
      token: document.getElementById("s-token").value.trim(),
      workerUrl: document.getElementById("s-worker").value.trim(),
    });
    setStatus(document.getElementById("settings-status"), "Settings saved on this device.", "ok");
  });

  // auto-slug from title unless user is editing slug directly
  document.getElementById("f-title").addEventListener("input", (e) => {
    const slugField = document.getElementById("f-slug");
    if (!slugField.dataset.userEdited) slugField.value = slugify(e.target.value);
  });
  document.getElementById("f-slug").addEventListener("input", (e) => {
    e.target.dataset.userEdited = "1";
  });

  document.getElementById("add-objection").addEventListener("click", () => {
    state.objections.push({ objection: "", reply: "", sources: [] });
    renderObjections();
  });

  document.getElementById("new-teaching").addEventListener("click", () => {
    teachingToForm({});
    document.getElementById("f-slug").dataset.userEdited = "";
  });

  // load existing teaching by slug
  document.getElementById("load-teaching").addEventListener("click", async () => {
    const slug = document.getElementById("load-slug").value.trim();
    const statusEl = document.getElementById("form-status");
    if (!slug) return;
    setStatus(statusEl, "Loading...", "pending");
    try {
      const file = await ghGetFile(`data/teachings/${slug}.json`);
      if (!file) { setStatus(statusEl, "No teaching found with that slug.", "err"); return; }
      teachingToForm(JSON.parse(file.content));
      document.getElementById("f-slug").dataset.userEdited = "1";
      setStatus(statusEl, `Loaded "${slug}" from GitHub.`, "ok");
    } catch (err) {
      setStatus(statusEl, err.message, "err");
    }
  });

  // AI: fetch a source URL's text via the worker
  document.getElementById("fetch-url").addEventListener("click", async () => {
    const url = document.getElementById("source-url").value.trim();
    const statusEl = document.getElementById("ai-status");
    if (!url) return;
    setStatus(statusEl, "Fetching page through your Worker...", "pending");
    try {
      const text = await workerFetchPage(url);
      document.getElementById("source-text").value = text;
      setStatus(statusEl, "Fetched. Review the text below before compiling.", "ok");
    } catch (err) {
      setStatus(statusEl, err.message, "err");
    }
  });

  // AI: compile a draft from the source text box
  document.getElementById("compile-btn").addEventListener("click", async () => {
    const sourceText = document.getElementById("source-text").value.trim();
    const instruction = document.getElementById("ai-instruction").value;
    const statusEl = document.getElementById("ai-status");
    if (!sourceText) { setStatus(statusEl, "Paste or fetch some source text first.", "err"); return; }
    setStatus(statusEl, "Asking Gemini to draft this...", "pending");
    try {
      const draft = await workerCompile(instruction, sourceText);
      document.getElementById("ai-output").textContent = draft;
      setStatus(statusEl, "Draft ready. Review it, then insert into a field below.", "ok");
    } catch (err) {
      setStatus(statusEl, err.message, "err");
    }
  });

  // insert AI draft into a chosen field
  document.getElementById("insert-target").addEventListener("change", () => {});
  document.getElementById("insert-btn").addEventListener("click", () => {
    const draft = document.getElementById("ai-output").textContent;
    const target = document.getElementById("insert-target").value;
    if (!draft) return;
    if (target === "teaching") document.getElementById("f-teaching").value = draft;
    else if (target === "why") document.getElementById("f-why").value = draft;
    else if (target === "new-objection") {
      state.objections.push({ objection: draft, reply: "", sources: [] });
      renderObjections();
    } else if (target.startsWith("reply-")) {
      const idx = Number(target.split("-")[1]);
      if (state.objections[idx]) {
        state.objections[idx].reply = draft;
        renderObjections();
      }
    }
    refreshInsertTargets();
  });

  function refreshInsertTargets() {
    const sel = document.getElementById("insert-target");
    const replyOptions = state.objections.map((o, i) =>
      `<option value="reply-${i}">Reply to Objection ${i + 1}</option>`).join("");
    sel.innerHTML = `
      <option value="teaching">Teaching explanation</option>
      <option value="why">"Why the Church teaches this"</option>
      <option value="new-objection">New objection (as objection text)</option>
      ${replyOptions}
    `;
  }
  const _renderObjections = renderObjections;
  renderObjections = function () { _renderObjections(); refreshInsertTargets(); };

  // copy JSON to clipboard (manual fallback, no GitHub token needed)
  document.getElementById("copy-json").addEventListener("click", async () => {
    const t = formToTeaching();
    await navigator.clipboard.writeText(JSON.stringify(t, null, 2));
    setStatus(document.getElementById("form-status"), "JSON copied to clipboard.", "ok");
  });

  // save to GitHub: writes data/teachings/{slug}.json and updates data/index.json
  document.getElementById("save-github").addEventListener("click", async () => {
    const statusEl = document.getElementById("form-status");
    const t = formToTeaching();
    if (!t.slug || !t.title) { setStatus(statusEl, "Title and slug are required.", "err"); return; }
    setStatus(statusEl, "Saving to GitHub...", "pending");
    try {
      await ghPutFile(
        `data/teachings/${t.slug}.json`,
        JSON.stringify(t, null, 2),
        `Update teaching: ${t.title}`
      );

      // update index.json
      const idxFile = await ghGetFile("data/index.json");
      const idx = idxFile ? JSON.parse(idxFile.content) : { teachings: [] };
      const entry = {
        slug: t.slug, title: t.title, category: t.category,
        blurb: (t.teaching || "").slice(0, 160),
      };
      const pos = idx.teachings.findIndex(x => x.slug === t.slug);
      if (pos >= 0) idx.teachings[pos] = entry; else idx.teachings.push(entry);
      await ghPutFile("data/index.json", JSON.stringify(idx, null, 2), `Index: ${t.title}`);

      setStatus(statusEl, `Saved "${t.title}" to GitHub. It'll appear on the site after Pages rebuilds (usually under a minute).`, "ok");
    } catch (err) {
      setStatus(statusEl, err.message, "err");
    }
  });

  teachingToForm({});
});
