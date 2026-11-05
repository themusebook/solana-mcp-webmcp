// Side-effect-only: load .env before any module reads process.env.
import * as dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 8080),
  databricks: {
    host: process.env.DATABRICKS_HOST ?? "",
    token: process.env.DATABRICKS_TOKEN ?? "",
    vsIndex: process.env.DATABRICKS_VS_INDEX ?? "",
  },
  gateway: {
    baseUrl: (process.env.NEON_AI_GATEWAY_BASE_URL ?? "").replace(/\/$/, ""),
    token: process.env.NEON_AI_GATEWAY_TOKEN ?? "",
    defaultModel: process.env.AI_GATEWAY_DEFAULT_MODEL ?? "claude-haiku-4-5",
  },
  auth: {
    authUrl: process.env.AUTH_URL ?? "",
    jwksUrl: process.env.JWKS_URL ?? "",
  },
  dataApiUrl: (process.env.DATA_API_URL ?? "").replace(/\/$/, ""),
  databaseUrl: process.env.DATABASE_URL ?? "",
  s3: {
    endpoint: process.env.AWS_ENDPOINT_URL_S3 ?? "",
    region: process.env.AWS_REGION ?? "us-east-2",
    bucket: process.env.ASSETS_BUCKET ?? "assets",
  },
};

export function gatewayConfigured(): boolean {
  return Boolean(env.gateway.baseUrl && env.gateway.token);
}

export function authConfigured(): boolean {
  return Boolean(env.auth.jwksUrl);
}

export function databricksConfigured(): boolean {
  return Boolean(env.databricks.host && env.databricks.token && env.databricks.vsIndex);
}
