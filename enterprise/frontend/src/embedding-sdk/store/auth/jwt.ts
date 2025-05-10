import type { MetabaseFetchRequestTokenFn } from "embedding-sdk/types/refresh-token";

import { getFetchParams } from "./auth";

export const jwtRefreshFunction: MetabaseFetchRequestTokenFn = async (url) => {
  const clientBackendResponse = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  // This should return {url: /auth/sso?jwt=[...]} with the signed token from the client backend
  const clientBackendResponseJson = await clientBackendResponse.json();

  // POST to /auth/sso?jwt=[...]
  const authUrlWithJwtToken = clientBackendResponseJson.url;
  const authSsoReponse = await fetch(authUrlWithJwtToken, getFetchParams());

  if (!authSsoReponse.ok) {
    throw new Error(
      `Failed to fetch the session, HTTP status: ${authSsoReponse.status}`,
    );
  }
  const asText = await authSsoReponse.text();

  try {
    return JSON.parse(asText);
  } catch (ex) {
    return asText;
  }
};
