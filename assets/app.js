// Quaestiones — browse/reader logic
// Loads data/index.json for the list, then data/teachings/{slug}.json on demand.

const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV"];

function toRoman(n) {
  return ROMAN[n - 1] || String(n);
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

async function loadIndex() {
  const res = await fetch("data/index.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load data/index.json");
  const data = await res.json();
  return data.teachings || [];
}

async function loadTeaching(slug) {
  const res = await fetch(`data/teachings/${encodeURIComponent(slug)}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load teaching "${slug}"`);
  return res.json();
}

function renderList(root, teachings, opts = {}) {
  const { query = "", category = "All" } = opts;
  const q = query.trim().toLowerCase();

  const categories = ["All", ...Array.from(new Set(teachings.map(t => t.category))).sort()];

  const filtered = teachings.filter(t => {
    const matchesCategory = category === "All" || t.category === category;
    const matchesQuery = !q ||
      t.title.toLowerCase().includes(q) ||
      (t.blurb || "").toLowerCase().includes(q) ||
      (t.category || "").toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });

  root.innerHTML = `
    <div class="search-row">
      <input type="search" id="search-input" placeholder="Search a teaching (e.g. Real Presence, Immaculate Conception)..." value="${esc(query)}" />
      <div class="category-filters" id="category-filters">
        ${categories.map(c => `<button data-cat="${esc(c)}" class="${c === category ? "active" : ""}">${esc(c)}</button>`).join("")}
      </div>
    </div>
    ${filtered.length ? `
      <ul class="teaching-list">
        ${filtered.map(t => `
          <li>
            <a class="teaching-card" href="#/${encodeURIComponent(t.slug)}">
              <div class="eyebrow">${esc(t.category)}</div>
              <h3>${esc(t.title)}</h3>
              <p>${esc(t.blurb)}</p>
            </a>
          </li>
        `).join("")}
      </ul>
    ` : `
      <div class="empty-state">No teachings match yet. Add one from the editor.</div>
    `}
  `;

  root.querySelector("#search-input").addEventListener("input", (e) => {
    renderList(root, teachings, { query: e.target.value, category });
  });
  root.querySelectorAll("#category-filters button").forEach(btn => {
    btn.addEventListener("click", () => {
      renderList(root, teachings, { query, category: btn.dataset.cat });
    });
  });
}

function renderDetail(root, t) {
  document.title = `${t.title} — Quaestiones`;
  root.innerHTML = `
    <a class="back-link" href="#/">&larr; All teachings</a>
    <article class="disputation">
      <div class="quaestio-label">${esc(t.category || "")}</div>
      <h2>${esc(t.question || `Whether ${t.title} is true`)}</h2>

      <div class="block">
        <h4>The teaching</h4>
        <p>${esc(t.teaching || "")}</p>
      </div>

      ${t.why ? `
        <div class="block">
          <h4>Why the Church teaches this</h4>
          <p>${esc(t.why)}</p>
        </div>
      ` : ""}

      <div class="block">
        <h4>Objections &amp; replies</h4>
        ${(t.objections || []).map((o, i) => `
          <div class="objection">
            <div class="num">Objection ${toRoman(o.id || (i + 1))}</div>
            <p class="obj-text">${esc(o.objection)}</p>
            <div class="reply">
              <div class="reply-label">Reply</div>
              <p>${esc(o.reply)}</p>
            </div>
            ${o.sources && o.sources.length ? `
              <div class="sources-list">Sources: ${o.sources.map(esc).join(" &middot; ")}</div>
            ` : ""}
          </div>
        `).join("")}
      </div>

      ${t.furtherSources && t.furtherSources.length ? `
        <div class="further-sources">
          <strong>Further reading</strong>
          <ul>${t.furtherSources.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
        </div>
      ` : ""}
    </article>
  `;
}

async function router() {
  const root = document.getElementById("app-root");
  const hash = window.location.hash.replace(/^#\/?/, "");

  try {
    if (!hash) {
      document.title = "Quaestiones";
      const teachings = await loadIndex();
      renderList(root, teachings);
    } else {
      root.innerHTML = `<div class="empty-state">Loading&hellip;</div>`;
      const teaching = await loadTeaching(hash);
      renderDetail(root, teaching);
    }
  } catch (err) {
    root.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
