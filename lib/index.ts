import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { createTools, type ToolDef } from "./tools.js";
import { DOCS_EXPLORER_HTML, DOCS_EXPLORER_MIME_TYPE, DOCS_EXPLORER_URI } from "./ui.js";

const SERVER_INSTRUCTIONS = `This is a Solana MCP server for the Web MCP era. It has a built-in AI gateway — you do not need your own model key.

Tools:
1. solana_ask(question, model?) — ask a Solana question; the server's Neon AI Gateway generates the answer in-server.
2. ai_models — list the gateway models available through this server.
3. ai_chat(prompt, model?) — general gateway chat; requires the user to be signed in (Neon Auth).
4. whoami — the signed-in user's profile (stable opaque id).
5. render_docs_explorer(query?, chunks?, sources?) — render search/section results in the Docs Explorer widget. Call a data tool first, then pass its structured results here.
6. storage_put_text(key, body) — store a text object in the server's S3 bucket and get a presigned URL; requires sign-in.

Prefer solana_ask for Solana how-to and debugging questions.`;

/** Best-effort bearer extraction across SDK handler-context shapes. */
function bearerFromContext(ctx: unknown): string | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  const c = ctx as Record<string, unknown>;
  const authInfo = c.authInfo as { token?: string } | undefined;
  if (authInfo?.token) return authInfo.token;
  const request = c.request as { headers?: Headers | Record<string, string> } | undefined;
  const headers = request?.headers;
  if (headers instanceof Headers) {
    const auth = headers.get("authorization");
    if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  } else if (headers && typeof headers === "object") {
    const auth = (headers as Record<string, string>).authorization;
    if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  }
  return undefined;
}

export function createMcp() {
  return createMcpHandler(
    (server: McpServer) => {
      const tools: ToolDef[] = createTools();
      for (const tool of tools) {
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: z.object(tool.parameters),
            ...(tool.outputSchema ? { outputSchema: z.object(tool.outputSchema) } : {}),
            ...(tool.annotations ? { annotations: tool.annotations } : {}),
            ...(tool.meta ? { _meta: tool.meta } : {}),
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (params: any, ctx: unknown) =>
            tool.func(params, {
              bearerToken: bearerFromContext(ctx),
              serverBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`,
            }),
        );
      }

      server.registerResource(
        "solana-docs-explorer",
        DOCS_EXPLORER_URI,
        { title: "Solana Docs Explorer", mimeType: DOCS_EXPLORER_MIME_TYPE },
        async () => ({
          contents: [
            {
              uri: DOCS_EXPLORER_URI,
              mimeType: DOCS_EXPLORER_MIME_TYPE,
              text: DOCS_EXPLORER_HTML,
              _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
            },
          ],
        }),
      );
    },
    {
      serverInfo: { name: "solana-mcp-webmcp", version: "0.1.0" },
      instructions: SERVER_INSTRUCTIONS,
      verboseLogs: true,
    },
  );
}
