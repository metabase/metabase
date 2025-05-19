import type { MetabaseFetchRequestTokenFn } from "embedding-sdk/types/refresh-token";

export const jwtRefreshFunction: MetabaseFetchRequestTokenFn = async (url) => {
  const clientBackendResponse = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  // This should return {url: /auth/sso?jwt=[...]} with the signed token from the client backend
  return await clientBackendResponse.json();
};
