import type { MetabaseAuthConfig } from "embedding-sdk/types/auth-config";

import { getFetchParams } from "./auth";

export async function jwtRefreshTokenFn(
  url: MetabaseAuthConfig["metabaseInstanceUrl"],
  hash: string,
  customFetchRequestFunction: MetabaseAuthConfig["fetchRequestToken"],
) {
  // Points to the JWT Auth endpoint on the client server
  // This should return {url: /auth/sso?jwt=[...]} with the signed token from the client backend
  const clientBackendResponse = await (
    customFetchRequestFunction ?? jwtRefreshFunction
  )(url);

  const jwtTokenResponse = clientBackendResponse.jwt;
  const mbAuthUrl = new URL(`${url}/auth/sso`);
  mbAuthUrl.searchParams.set("jwt", jwtTokenResponse);
  const authSsoReponse = await fetch(mbAuthUrl, getFetchParams(hash));

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
}

const jwtRefreshFunction = async (
  url: MetabaseAuthConfig["metabaseInstanceUrl"],
) => {
  const clientBackendResponse = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  // This should return {url: /auth/sso?jwt=[...]} with the signed token from the client backend
  return await clientBackendResponse.json();
};
