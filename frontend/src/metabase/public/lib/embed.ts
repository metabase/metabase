import querystring from "querystring";
import { KJUR } from "jsrsasign"; // using jsrsasign because jsonwebtoken doesn't work on the web :-/

import type {
  EmbedResourceType,
  EmbedResource,
  EmbeddingParameters,
  EmbeddingDisplayOptions,
} from "./types";

function getSignedToken(
  resourceType: EmbedResourceType,
  resourceId: EmbedResource["id"],
  params: EmbeddingParameters = {},
  secretKey: string,
  previewEmbeddingParams: EmbeddingParameters,
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
  return KJUR.jws.JWS.sign(null, { alg: "HS256" }, unsignedToken, {
    utf8: secretKey,
  });
}

export function getSignedPreviewUrl(
  siteUrl: string,
  resourceType: EmbedResourceType,
  resourceId: EmbedResource["id"],
  params: EmbeddingParameters = {},
  options: EmbeddingDisplayOptions,
  secretKey: string,
  previewEmbeddingParams: EmbeddingParameters,
) {
  const token = getSignedToken(
    resourceType,
    resourceId,
    params,
    secretKey,
    previewEmbeddingParams,
  );
  return `${siteUrl}/embed/${resourceType}/${token}${optionsToHashParams(
    options,
  )}`;
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
