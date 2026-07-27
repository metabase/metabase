import querystring from "querystring";

import type {
  EmbedResource,
  EmbedResourceType,
  EmbeddingParametersValues,
} from "../types";

import { getSignedToken } from "./auth/get-signed-token";

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
