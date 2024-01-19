import querystring from "querystring";
import type {
  EmbeddingParameters,
  EmbedResource,
} from "metabase/public/components/EmbedModal";

// using jsrsasign because jsonwebtoken doesn't work on the web :-/
import type {
  GetSignedPreviewUrlProps,
  GetSignedTokenProps,
} from "metabase/public/lib/types";
import sign = jsrsasign.KJUR.jws.JWS.sign;

export const optionsToHashParams = (options: Record<string, any> = {}) => {
  options = { ...options };
  // filter out null, undefined, ""
  for (const name in options) {
    if (options[name] == null || options[name] === "") {
      delete options[name];
    }
  }
  const query = querystring.stringify(options);
  return query ? `#${query}` : ``;
};

export const getSignedToken = ({
  resourceType,
  resourceId,
  params = {},
  secretKey,
  previewEmbeddingParams,
}: GetSignedTokenProps) => {
  const unsignedToken: {
    resource: Record<string, EmbedResource["id"]>;
    params: Record<string, unknown>;
    iat: number;
    _embedding_params?: EmbeddingParameters;
  } = {
    resource: { [resourceType]: resourceId },
    params: params,
    iat: Math.round(new Date().getTime() / 1000),
  };
  // include the `embedding_params` settings inline in the token for previews
  if (previewEmbeddingParams) {
    unsignedToken._embedding_params = previewEmbeddingParams;
  }

  const stringifiedHeader = JSON.stringify({ alg: "HS256", cty: "JWT" });

  return sign(null, stringifiedHeader, unsignedToken, {
    utf8: secretKey,
  });
};

export const getSignedPreviewUrl = ({
  siteUrl,
  resourceType,
  resourceId,
  params = {},
  options,
  secretKey,
  previewEmbeddingParams,
}: GetSignedPreviewUrlProps) => {
  const token = getSignedToken({
    resourceType: resourceType,
    resourceId: resourceId,
    params: params,
    secretKey: secretKey,
    previewEmbeddingParams: previewEmbeddingParams,
  });
  return `${siteUrl}/embed/${resourceType}/${token}${optionsToHashParams(
    options,
  )}`;
};
