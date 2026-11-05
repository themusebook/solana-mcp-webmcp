// WebMCP: expose this server's tools to browser agents via navigator.modelContext.
// Guarded — pages must never throw when the WebMCP API is unavailable.
(function () {
  const mc = navigator.modelContext;
  if (!mc || typeof mc.registerTool !== "function") return;

  async function callTool(name, args) {
    const res = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args ?? {} } }),
    });
    const text = await res.text();
    // Streamable HTTP may answer with SSE framing; take the data: line if present.
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    const payload = JSON.parse(dataLine ? dataLine.slice(5) : text);
    const result = payload.result ?? {};
    const first = (result.content ?? []).find((c) => c.type === "text");
    return first ? first.text : JSON.stringify(result.structuredContent ?? result);
  }

  const tools = [
    {
      name: "solana_ask",
      description: "Ask a Solana question; the server's built-in AI gateway answers.",
      inputSchema: {
        type: "object",
        properties: { question: { type: "string" }, model: { type: "string" } },
        required: ["question"],
      },
      execute: (args) => callTool("solana_ask", args),
    },
    {
      name: "ai_models",
      description: "List the AI gateway models available through this server.",
      inputSchema: { type: "object", properties: {} },
      execute: () => callTool("ai_models", {}),
    },
  ];

  for (const tool of tools) {
    try {
      mc.registerTool(tool);
    } catch {
      // A duplicate or rejected registration must not break the page.
    }
  }
})();
