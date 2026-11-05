import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { authConfigured, env } from "./env.js";

/**
 * Neon Auth verification. Neon Auth issues EdDSA JWTs; the public keys are
 * published at JWKS_URL (verified live: 1 key, alg EdDSA). Authenticated
 * tools call `requireUser` with the request's bearer token; anonymous
 * tools never call it. This is the resource-server half of the MCP
 * authorization flow — Neon Auth is the authorization server.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(env.auth.jwksUrl));
  return jwks;
}

export interface AuthedUser {
  id: string;
  email?: string;
  name?: string;
  payload: JWTPayload;
}

export async function verifyBearer(token: string | undefined): Promise<AuthedUser | null> {
  if (!token || !authConfigured()) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      payload,
    };
  } catch {
    return null;
  }
}

/** The `WWW-Authenticate` challenge payload for tool-level auth errors. */
export function wwwAuthenticateMeta(serverBaseUrl: string): Record<string, unknown> {
  return {
    "mcp/www_authenticate": [
      `Bearer resource_metadata="${serverBaseUrl}/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="You need to login to continue"`,
    ],
  };
}

/** RFC 9728 protected-resource metadata for this MCP server. */
export function protectedResourceMetadata(serverBaseUrl: string) {
  return {
    resource: `${serverBaseUrl}/mcp`,
    authorization_servers: [env.auth.authUrl.replace(/\/neondb\/auth$/, "") || env.auth.authUrl],
    scopes_supported: ["solana:read", "solana:ai", "solana:write"],
    resource_documentation: `${serverBaseUrl}/`,
  };
}
