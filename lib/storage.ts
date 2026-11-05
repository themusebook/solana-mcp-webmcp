import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "./env.js";

/**
 * Neon Object Storage (S3-compatible), forcePathStyle as required by Neon.
 * Proven against the reference deployment: bucket `assets`,
 * PutObject + presigned GET round-trip byte-exact.
 * Credentials come from the standard AWS_* env chain — never hard-code them.
 */

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      forcePathStyle: true,
      region: env.s3.region,
      ...(env.s3.endpoint ? { endpoint: env.s3.endpoint } : {}),
    });
  }
  return client;
}

export async function putTextObject(key: string, body: string): Promise<{ bucket: string; key: string }> {
  await getClient().send(
    new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: "text/plain; charset=utf-8" }),
  );
  return { bucket: env.s3.bucket, key };
}

export async function presignGetUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), { expiresIn });
}
