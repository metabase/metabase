import { CompactSign } from "jose";

import type {
  EmbedResource,
  EmbedResourceType,
  EmbeddingParametersValues,
} from "../../types";

const DEFAULT_SIGNED_TOKEN_EXPIRATION_MINUTES = 10;

export async function getSignedToken(
  resourceType: EmbedResourceType,
  rawResourceId: EmbedResource["id"],
  params: EmbeddingParametersValues = {},
  secretKey: string,
  previewEmbeddingParams: EmbeddingParametersValues,
  expirationMinutes: number = DEFAULT_SIGNED_TOKEN_EXPIRATION_MINUTES,
) {
  // rawResourceId is force converted to number
  const normalizedResourceId = parseInt(rawResourceId as string, 10);

  const iat = Math.round(new Date().getTime() / 1000);
  const exp = iat + 60 * expirationMinutes;

  const unsignedToken: Record<string, any> = {
    resource: { [resourceType]: normalizedResourceId },
    params: params,
    iat,
    exp,
  };
  // include the `embedding_params` settings inline in the token for previews
  if (previewEmbeddingParams) {
    unsignedToken._embedding_params = previewEmbeddingParams;
  }

  const encoder = new TextEncoder();
  const key = encoder.encode(secretKey);

  return new CompactSign(encoder.encode(JSON.stringify(unsignedToken)))
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
}
