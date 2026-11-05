import { describe, expect, it } from "vitest";

import { createTools, TOOL_NAMES } from "../lib/tools.js";
import { DOCS_EXPLORER_MIME_TYPE, DOCS_EXPLORER_URI } from "../lib/ui.js";

describe("tool registry", () => {
  it("exposes the WebMCP-era tool set", () => {
    expect(TOOL_NAMES).toEqual(
      expect.arrayContaining(["solana_ask", "ai_models", "ai_chat", "whoami", "render_docs_explorer", "storage_put_text"]),
    );
  });

  it("declares securitySchemes on every tool", () => {
    for (const tool of createTools()) {
      const schemes = (tool.meta as { securitySchemes?: unknown[] } | undefined)?.securitySchemes;
      expect(Array.isArray(schemes), tool.name).toBe(true);
    }
  });

  it("links only the render tool to the docs explorer UI", () => {
    const render = createTools().find((t) => t.name === "render_docs_explorer");
    expect(render?.meta?.ui).toEqual({ resourceUri: DOCS_EXPLORER_URI });
    expect(render?.meta?.["openai/outputTemplate"]).toBe(DOCS_EXPLORER_URI);
    for (const tool of createTools()) {
      if (tool.name === "render_docs_explorer") continue;
      expect(tool.meta?.ui, tool.name).toBeUndefined();
    }
  });

  it("marks whoami as the profile tool", () => {
    const whoami = createTools().find((t) => t.name === "whoami");
    expect(whoami?.meta?.["openai/profile"]).toBe(true);
    expect(whoami?.outputSchema).toBeDefined();
  });

  it("uses the MCP Apps mime type for the explorer resource", () => {
    expect(DOCS_EXPLORER_MIME_TYPE).toBe("text/html;profile=mcp-app");
  });
});
