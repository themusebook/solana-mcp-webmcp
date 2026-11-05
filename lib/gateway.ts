import { env, gatewayConfigured } from "./env.js";

/**
 * Neon AI Gateway client — OpenAI-compatible surface.
 * Verified against the reference deployment: GET /v1/models → 63 models,
 * all enabled; chat completions are OpenAI-shaped (streaming supported).
 */

export interface GatewayModel {
  id: string;
  enabled?: boolean;
}

export async function listGatewayModels(): Promise<GatewayModel[]> {
  if (!gatewayConfigured()) return [];
  const res = await fetch(`${env.gateway.baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${env.gateway.token}` },
  });
  if (!res.ok) throw new Error(`gateway /v1/models failed: ${res.status}`);
  const body = (await res.json()) as { data?: GatewayModel[] };
  return body.data ?? [];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function gatewayChat(
  messages: ChatMessage[],
  model: string = env.gateway.defaultModel,
): Promise<{ text: string; model: string; usage?: unknown }> {
  if (!gatewayConfigured()) {
    throw new Error("AI gateway is not configured (NEON_AI_GATEWAY_BASE_URL / NEON_AI_GATEWAY_TOKEN).");
  }
  const res = await fetch(`${env.gateway.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.gateway.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`gateway chat failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    model?: string;
    usage?: unknown;
    choices?: Array<{ message?: { content?: string } }>;
  };
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    model: body.model ?? model,
    usage: body.usage,
  };
}
