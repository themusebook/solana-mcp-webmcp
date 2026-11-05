/**
 * MCP Apps resource for the docs explorer widget.
 * Single self-contained HTML file, no external requests (narrowest CSP).
 * It renders the render tool's structuredContent and follows the MCP Apps
 * bridge: ui/initialize handshake, ui/notifications/tool-result for data,
 * tools/call for follow-up actions.
 */

export const DOCS_EXPLORER_URI = "ui://solana/docs-explorer.html";
export const DOCS_EXPLORER_MIME_TYPE = "text/html;profile=mcp-app";

export const DOCS_EXPLORER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Solana Docs Explorer</title>
<style>
  :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { opacity: .7; font-size: 13px; margin-bottom: 12px; }
  .card { border: 1px solid rgba(128,128,128,.35); border-radius: 12px; padding: 12px; margin-bottom: 10px; }
  .card h3 { margin: 0 0 4px; font-size: 15px; }
  .meta { font-size: 12px; opacity: .65; margin-bottom: 6px; }
  .snippet { font-size: 13px; white-space: pre-wrap; }
  a { color: #9945ff; }
  .empty { opacity: .7; font-size: 14px; }
</style>
</head>
<body>
<h1>Solana Docs Explorer</h1>
<div class="sub" id="sub">Waiting for results…</div>
<div id="list"></div>
<script type="module">
  const list = document.getElementById("list");
  const sub = document.getElementById("sub");

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function render(data) {
    const chunks = Array.isArray(data?.chunks) ? data.chunks : [];
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    if (data?.query) sub.textContent = 'Results for "' + data.query + '"';
    if (chunks.length === 0 && sources.length === 0) {
      list.innerHTML = '<div class="empty">No structured results yet. Ask for a documentation search first, then render it here.</div>';
      return;
    }
    const cards = [];
    for (const c of chunks) {
      const title = c.url ? '<a href="' + esc(c.url) + '" target="_blank" rel="noreferrer">' + esc(c.title ?? c.url) + "</a>" : esc(c.title ?? "Untitled");
      cards.push('<div class="card"><h3>' + title + '</h3><div class="meta">' +
        esc([c.sourceId ? "source: " + c.sourceId : "", typeof c.score === "number" ? "score: " + c.score.toFixed(3) : ""].filter(Boolean).join(" · ")) +
        '</div><div class="snippet">' + esc((c.content ?? "").slice(0, 600)) + "</div></div>");
    }
    for (const s of sources) {
      cards.push('<div class="card"><h3>' + esc(s.title ?? s.id) + '</h3><div class="meta">id: ' + esc(s.id) +
        " · sections: " + esc((s.sections ?? []).join(", ")) + '</div><div class="snippet">' + esc(s.use_cases ?? "") + "</div></div>");
    }
    list.innerHTML = cards.join("");
  }

  let nextId = 1;
  function send(method, params) {
    window.parent.postMessage({ jsonrpc: "2.0", id: nextId++, method, params }, "*");
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.method === "ui/notifications/tool-result") render(msg.params?.structuredContent ?? {});
    if (msg.method === "ui/notifications/tool-input") render(msg.params?.arguments ?? {});
  });

  send("ui/initialize", { appInfo: { name: "Solana Docs Explorer", version: "0.1.0" }, appCapabilities: {} });
  render({});
</script>
</body>
</html>`;
