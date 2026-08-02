/**
 * Quaestiones — Gemini proxy Worker
 *
 * Deploy this to Cloudflare Workers (free tier). It does two things:
 *   1. action "fetchPage": fetches a URL server-side (avoids CORS) and
 *      strips it down to plain text for you to review before compiling.
 *   2. action "compile": sends your instruction + source text to Gemini
 *      and returns the drafted text.
 *
 * Setup:
 *   1. Get a free Gemini API key at https://aistudio.google.com/apikey
 *   2. `wrangler secret put GEMINI_API_KEY` (or set it in the dashboard
 *      under Settings -> Variables as an encrypted secret)
 *   3. Deploy: `wrangler deploy`
 *   4. Paste the resulting workers.dev URL into the editor's settings panel.
 *
 * IMPORTANT: this Worker is unauthenticated by default, so anyone who
 * discovers the URL could spend your free Gemini quota. For a purely
 * personal tool that's usually a low-risk tradeoff, but if you want to
 * lock it down, add a shared-secret header check (see bottom of file).
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const ALLOWED_ORIGIN = "*"; // tighten to your GitHub Pages URL once deployed, e.g. "https://yourname.github.io"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function stripHtml(html) {
  // Very small, dependency-free text extraction: drop script/style, tags, collapse whitespace.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000); // keep payloads reasonable
}

async function handleFetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; QuaestionesBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();
  return stripHtml(html);
}

async function handleCompile(env, prompt, sourceText) {
  const body = {
    contents: [{ parts: [{ text: `${prompt}\n\n---\nSOURCE TEXT:\n${sourceText}` }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    try {
      const { action, url, prompt, sourceText } = await request.json();

      let result;
      if (action === "fetchPage") {
        result = { text: await handleFetchPage(url) };
      } else if (action === "compile") {
        result = { text: await handleCompile(env, prompt, sourceText) };
      } else {
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message || err) }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
  },
};

/* --- Optional: lock the Worker to only you ---
   Uncomment below, set a WORKER_SECRET via `wrangler secret put WORKER_SECRET`,
   and have editor.js send it as a header (see README for the one-line change).

   const provided = request.headers.get("X-Quaestiones-Secret");
   if (provided !== env.WORKER_SECRET) {
     return new Response("Unauthorized", { status: 401, headers: corsHeaders() });
   }
*/
