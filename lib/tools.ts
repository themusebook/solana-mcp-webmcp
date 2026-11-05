import { z } from "zod";

import { gatewayChat, listGatewayModels } from "./gateway.js";
import { presignGetUrl, putTextObject } from "./storage.js";
import { DOCS_EXPLORER_URI } from "./ui.js";

/**
 * Tool registry. Every tool is a plain object; lib/index.ts registers them
 * with the MCP server, passing `_meta` through verbatim.
 *
 * Auth model (per the MCP authorization spec):
 * - Anonymous tools declare `securitySchemes: [{ type: "noauth" }]`.
 * - Authenticated tools declare `oauth2` with scopes and receive the
 *   caller's Neon Auth bearer token via the handler context; the token is
 *   verified against the Neon Auth JWKS in lib/auth.ts before use.
 */

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  parameters: z.ZodRawShape;
  outputSchema?: z.ZodRawShape;
  annotations?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (params: any, ctx: { bearerToken?: string; serverBaseUrl: string }) => Promise<any>;
}

const NOAUTH = { securitySchemes: [{ type: "noauth" }] };
const OAUTH_AI = { securitySchemes: [{ type: "oauth2", scopes: ["solana:ai"] }] };
const OAUTH_WRITE = { securitySchemes: [{ type: "oauth2", scopes: ["solana:write"] }] };

const CHUNK_SHAPE = {
  id: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  sourceId: z.string().nullable(),
  score: z.number(),
  content: z.string().nullable(),
};

const SOURCE_SHAPE = {
  id: z.string(),
  title: z.string(),
  sections: z.array(z.string()),
  use_cases: z.string(),
};

const SOLANA_SYSTEM = `You are a Solana expert assistant inside an MCP server. Answer with current, concrete Solana guidance: prefer @solana/kit for new TypeScript, Anchor/Pinocchio for programs, and name exact functions, accounts, and PDAs where relevant. Be concise and correct over comprehensive.`;

export function createTools(): ToolDef[] {
  return [
    {
      name: "ai_models",
      title: "List AI gateway models",
      description: "List the models available through this server's built-in Neon AI Gateway (63 models on the reference deployment).",
      parameters: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      meta: NOAUTH,
      func: async () => {
        const models = await listGatewayModels();
        return {
          content: [{ type: "text", text: models.map((m) => m.id).join("\n") }],
          structuredContent: { models },
        };
      },
    },
    {
      name: "solana_ask",
      title: "Ask the Solana AI gateway",
      description:
        "Ask a Solana question and get an answer generated inside this server by its Neon AI Gateway. No external AI client needed — the gateway is built into the MCP server.",
      parameters: {
        question: z.string().describe("Solana question with as much context as possible."),
        model: z.string().optional().describe("Gateway model id; defaults to AI_GATEWAY_DEFAULT_MODEL."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      meta: NOAUTH,
      func: async ({ question, model }: { question: string; model?: string }) => {
        const { text, model: used } = await gatewayChat(
          [
            { role: "system", content: SOLANA_SYSTEM },
            { role: "user", content: question },
          ],
          model,
        );
        return {
          content: [{ type: "text", text }],
          structuredContent: { question, answer: text, model: used },
        };
      },
    },
    {
      name: "ai_chat",
      title: "AI gateway chat (authenticated)",
      description: "General chat completion through the built-in gateway. Requires a Neon Auth bearer token (scope solana:ai).",
      parameters: {
        prompt: z.string(),
        model: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      meta: OAUTH_AI,
      func: async ({ prompt, model }: { prompt: string; model?: string }, ctx) => {
        const { verifyBearer, wwwAuthenticateMeta } = await import("./auth.js");
        const user = await verifyBearer(ctx.bearerToken);
        if (!user) {
          return {
            isError: true,
            content: [{ type: "text", text: "Authentication required: no valid Neon Auth token provided." }],
            _meta: wwwAuthenticateMeta(ctx.serverBaseUrl),
          };
        }
        const { text, model: used } = await gatewayChat([{ role: "user", content: prompt }], model);
        return {
          content: [{ type: "text", text }],
          structuredContent: { answer: text, model: used, userId: user.id },
        };
      },
    },
    {
      name: "whoami",
      title: "Get the authenticated profile",
      description:
        "Return the profile represented by this request's Neon Auth credentials. The opaque id is stable across token refresh and reconnection.",
      parameters: {},
      outputSchema: {
        id: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      meta: { ...OAUTH_AI, "openai/profile": true },
      func: async (_params, ctx) => {
        const { verifyBearer, wwwAuthenticateMeta } = await import("./auth.js");
        const user = await verifyBearer(ctx.bearerToken);
        if (!user) {
          return {
            isError: true,
            content: [{ type: "text", text: "Authentication required: no valid Neon Auth token provided." }],
            _meta: wwwAuthenticateMeta(ctx.serverBaseUrl),
          };
        }
        const profile = {
          id: user.id,
          ...(user.name ? { name: user.name } : {}),
          ...(user.email ? { email: user.email } : {}),
        };
        return {
          structuredContent: profile,
          content: [{ type: "text", text: JSON.stringify(profile) }],
        };
      },
    },
    {
      name: "render_docs_explorer",
      title: "Render the docs explorer",
      description:
        "Render the Solana Docs Explorer widget. First call a search or sections tool, then pass its structured results (chunks and/or sources) to this tool.",
      parameters: {
        query: z.string().optional(),
        chunks: z.array(z.object(CHUNK_SHAPE)).optional(),
        sources: z.array(z.object(SOURCE_SHAPE)).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      meta: {
        ...NOAUTH,
        ui: { resourceUri: DOCS_EXPLORER_URI },
        "openai/outputTemplate": DOCS_EXPLORER_URI,
      },
      func: async (input: { query?: string; chunks?: unknown[]; sources?: unknown[] }) => ({
        structuredContent: {
          query: input.query ?? null,
          chunks: input.chunks ?? [],
          sources: input.sources ?? [],
        },
        content: [
          {
            type: "text",
            text: `Showing ${input.chunks?.length ?? 0} result(s) and ${input.sources?.length ?? 0} source(s) in the docs explorer.`,
          },
        ],
      }),
    },
    {
      name: "storage_put_text",
      title: "Store a text object (authenticated)",
      description: "Write a text object to the server's S3 storage bucket and return a presigned read URL. Requires Neon Auth (scope solana:write).",
      parameters: {
        key: z.string().describe("Object key, e.g. uploads/notes.txt"),
        body: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      meta: OAUTH_WRITE,
      func: async ({ key, body }: { key: string; body: string }, ctx) => {
        const { verifyBearer, wwwAuthenticateMeta } = await import("./auth.js");
        const user = await verifyBearer(ctx.bearerToken);
        if (!user) {
          return {
            isError: true,
            content: [{ type: "text", text: "Authentication required: no valid Neon Auth token provided." }],
            _meta: wwwAuthenticateMeta(ctx.serverBaseUrl),
          };
        }
        const stored = await putTextObject(key, body);
        const url = await presignGetUrl(key);
        return {
          content: [{ type: "text", text: `Stored s3://${stored.bucket}/${stored.key}\n[view] ${url}` }],
          structuredContent: { bucket: stored.bucket, key: stored.key, url },
        };
      },
    },
  ];
}

export const TOOL_NAMES = createTools().map((t) => t.name);
