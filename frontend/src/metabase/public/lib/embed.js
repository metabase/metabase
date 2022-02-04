import querystring from "querystring";

// using jsrsasign because jsonwebtoken doesn't work on the web :-/
import KJUR from "jsrsasign";

export function getSignedToken(
  resourceType,
  resourceId,
  params = {},
  secretKey,
  previewEmbeddingParams,
) {
  const unsignedToken = {
    resource: { [resourceType]: resourceId },
    params: params,
    iat: Math.round(new Date().getTime() / 1000),
  };
  // include the `embedding_params` settings inline in the token for previews
  if (previewEmbeddingParams) {
    unsignedToken._embedding_params = previewEmbeddingParams;
  }
  return KJUR.jws.JWS.sign(null, { alg: "HS256", typ: "JWT" }, unsignedToken, {
    utf8: secretKey,
  });
}

export function getSignedPreviewUrl(
  siteUrl,
  resourceType,
  resourceId,
  params = {},
  options,
  secretKey,
  previewEmbeddingParams,
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

export function getUnsignedPreviewUrl(
  siteUrl,
  resourceType,
  resourceId,
  options,
) {
  return `${siteUrl}/public/${resourceType}/${resourceId}${optionsToHashParams(
    options,
  )}`;
}

export function optionsToHashParams(options = {}) {
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
