import "../lib/env.js";

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";

import { protectedResourceMetadata } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { createMcp } from "../lib/index.js";

const PUBLIC_DIR = join(process.cwd(), "public");
const STATIC_ASSETS = new Map<string, string>([
  ["/", "text/html; charset=utf-8"],
  ["/index.html", "text/html; charset=utf-8"],
  ["/webmcp.js", "text/javascript; charset=utf-8"],
  ["/favicon.svg", "image/svg+xml"],
]);

const mcpHandler = createMcp();

const server = createServer((req, res) => {
  void route(req, res).catch((err) => {
    console.error("[server] handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    } else {
      res.end();
    }
  });
});

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;

  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && pathname === "/.well-known/oauth-protected-resource") {
    const base = process.env.PUBLIC_BASE_URL ?? `http://${req.headers.host ?? "localhost"}`;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(protectedResourceMetadata(base)));
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && STATIC_ASSETS.has(pathname)) {
    const fileName = pathname === "/" ? "index.html" : pathname.slice(1);
    try {
      const body = await readFile(join(PUBLIC_DIR, fileName));
      res.writeHead(200, {
        "Cache-Control": fileName === "index.html" ? "public, max-age=60" : "public, max-age=3600",
        "Content-Length": body.byteLength,
        "Content-Type": STATIC_ASSETS.get(pathname)!,
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
    return;
  }

  // Everything else is an MCP request.
  const webRes = await mcpHandler(await toWebRequest(req));
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  if (!webRes.body) {
    res.end();
    return;
  }
  const reader = webRes.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const fwdProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto) ?? "http";
  const url = new URL(req.url ?? "/", `${proto}://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }
  let body: Uint8Array | undefined;
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));
    body = new Uint8Array(Buffer.concat(chunks));
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: body && body.byteLength > 0 ? (body as BodyInit) : undefined,
  });
}

server.listen(env.port, () => {
  console.warn(`[server] solana-mcp-webmcp listening on :${env.port} (MCP at /mcp)`);
});
