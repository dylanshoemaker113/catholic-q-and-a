# Quaestiones

A personal, browsable library of disputed Catholic teachings — a question, the
Church's reasoning, then objections paired with replies. Styled loosely after
the old scholastic *quaestio disputata* format.

- **Public side** (`index.html`): browse and search. Static, fast, free.
- **Editor side** (`editor.html`): where you write/edit pages and save them
  straight to this GitHub repo, with an optional AI-assist for drafting from
  a source you found.

Everything is plain HTML/CSS/JS — no build step, no framework, no server
required for the public side.

---

## 1. One important thing about privacy

GitHub Pages on the **free** plan only serves **public** repositories. If you
make this repo private, GitHub Pages won't publish it unless you're on a paid
plan (Pro/Team). So by default: assume anything you commit here — including
the editor page itself — is visible to anyone who finds the repo. That's
normally fine for this kind of content (nobody's putting secrets in a
Purgatory article), but the **editor page isn't hidden from the public
either** — it's just not linked from the site. If that matters to you later,
options include making the repo private on a paid plan, or adding a simple
password gate to `editor.html`. Your GitHub token and Worker URL are only
ever stored in your own browser's `localStorage`, never committed to the repo.

## 2. Deploy the site

1. Create a new **public** GitHub repository (e.g. `quaestiones`).
2. Copy every file in this folder into the repo, preserving the structure:
   ```
   index.html
   editor.html
   assets/style.css
   assets/app.js
   assets/editor.js
   data/index.json
   data/teachings/purgatory.json
   worker/gemini-worker.js
   ```
3. Commit and push.
4. In the repo: **Settings → Pages → Build and deployment → Source** → set
   to "Deploy from a branch," branch `main`, folder `/ (root)`. Save.
5. After a minute your site is live at `https://<your-username>.github.io/<repo-name>/`.

That's the whole public side — done, and it'll stay working even before you
set up anything below.

## 3. Give the editor write access to your repo

1. On GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.**
2. Scope it to **this one repository only**.
3. Under permissions, grant **Contents: Read and write**. Nothing else is needed.
4. Set an expiration you're comfortable with (you can always generate a new one).
5. Copy the token. Open `editor.html` on your live site, expand "Connection
   settings," and fill in your GitHub username, repo name, branch (`main`),
   and this token. Click **Save settings** — this stores it only in that
   browser's local storage.

You can now load, edit, and save teaching pages, which will appear on the
public site within about a minute of saving (GitHub Pages rebuild time).

## 4. Set up the free AI-assist (optional, can skip for now)

The editor works fine without this — you can write and save pages by hand,
or use "Copy JSON" to paste a hand-written page in yourself. This step just
adds the "compile a draft from a source" button.

**a. Get a free Gemini API key**
Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign
in, and create a key. No credit card required for the free tier.

**b. Deploy the Worker (Cloudflare, free tier)**
1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) if you don't
   have an account.
2. Install Wrangler (Cloudflare's CLI): `npm install -g wrangler`
3. In the `worker/` folder: `wrangler init` (accept defaults, or just deploy
   the file directly — `wrangler deploy gemini-worker.js` also works for a
   single-file Worker).
4. Add your key as a secret so it's never exposed in code:
   `wrangler secret put GEMINI_API_KEY` and paste the key when prompted.
5. `wrangler deploy` — this prints a URL like
   `https://gemini-worker.yourname.workers.dev`.

**c. Connect it**
Paste that URL into the editor's "Cloudflare Worker URL" field and save
settings. The "Compile with AI" button will now work.

**d. Optional: lock the Worker down to just you**
Right now anyone who finds your Worker URL could spend your free Gemini
quota. For a personal tool this is usually low-risk, but if you want to
close it off, there's a commented-out snippet at the bottom of
`gemini-worker.js` — uncomment it, set a secret
(`wrangler secret put WORKER_SECRET`), and add one header to the two
`fetch()` calls in `assets/editor.js`:
```js
headers: { "Content-Type": "application/json", "X-Quaestiones-Secret": "your-secret" }
```

## 5. Using the editor day to day

1. Open `editor.html` on your live site (bookmark it — it's not linked from
   the public pages).
2. **Start new teaching** or **Load from GitHub** to edit an existing one.
3. Fill in the title, category, teaching explanation, and why the Church
   teaches it.
4. For each objection: either write it by hand, or on the right side paste a
   source URL (or its text), pick an instruction ("Draft an objection from
   this," "Draft a reply from this," etc.), click **Compile with AI**, review
   the draft, and **Insert** it into the field you want. Always read and edit
   the draft yourself — treat it as a first pass, not a finished citation.
5. **Save to GitHub** commits the page and updates the index. Give Pages a
   minute to rebuild, then refresh the public site.

## 6. Data format

Each teaching is one JSON file at `data/teachings/{slug}.json`:

```json
{
  "slug": "purgatory",
  "title": "Purgatory",
  "category": "Eschatology",
  "question": "Whether there is a Purgatory",
  "teaching": "...",
  "why": "...",
  "objections": [
    { "id": 1, "objection": "...", "reply": "...", "sources": ["..."] }
  ],
  "furtherSources": ["..."],
  "lastUpdated": "2026-07-28"
}
```

`data/index.json` just lists `{slug, title, category, blurb}` for the browse
page — the editor keeps it in sync automatically when you save.

A worked example (`purgatory.json`) is included so you can see the shape of
a finished page before writing your own.
