import { CompactSign } from "jose"; // using jose because jsonwebtoken doesn't work on the web :-/
import querystring from "querystring";

import type {
  EmbedResource,
  EmbedResourceType,
  EmbeddingParametersValues,
} from "./types";

async function getSignedToken(
  resourceType: EmbedResourceType,
  resourceId: EmbedResource["id"],
  params: EmbeddingParametersValues = {},
  secretKey: string,
  previewEmbeddingParams: EmbeddingParametersValues,
) {
  const unsignedToken: Record<string, any> = {
    resource: { [resourceType]: resourceId },
    params: params,
    iat: Math.round(new Date().getTime() / 1000),
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

export async function getSignedPreviewUrlWithoutHash(
  siteUrl: string,
  resourceType: EmbedResourceType,
  resourceId: EmbedResource["id"],
  params: EmbeddingParametersValues = {},
  secretKey: string,
  previewEmbeddingParams: EmbeddingParametersValues,
) {
  const token = await getSignedToken(
    resourceType,
    resourceId,
    params,
    secretKey,
    previewEmbeddingParams,
  );
  return `${siteUrl}/embed/${resourceType}/${token}`;
}

export function optionsToHashParams(
  options: Record<string, string | boolean | null> = {},
) {
  options = { ...options };
  // filter out null, undefined, ""
  for (const name in options) {
    if (options[name] == null || options[name] === "") {
      delete options[name];
    }
  }
  const query = querystring.stringify(options);
  return query ? `#${query}` : ``;
}
