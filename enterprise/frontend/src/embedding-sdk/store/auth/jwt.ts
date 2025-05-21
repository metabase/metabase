import type { MetabaseAuthConfig } from "embedding-sdk/types/auth-config";

import { getSdkRequestHeaders } from "./auth";

export async function jwtDefaultRefreshTokenFunction(
  responseUrl: string,
  instanceUrl: MetabaseAuthConfig["metabaseInstanceUrl"],
  hash: string,
  customFetchRequestToken:
    | MetabaseAuthConfig["fetchRequestToken"]
    | null = null,
) {
  // Points to the JWT Auth endpoint on the client server
  // This should return {url: /auth/sso?jwt=[...]} with the signed token from the client backend
  const clientBackendResponse = await (
    customFetchRequestToken ?? refreshUserJwt
  )(responseUrl);

  const jwtTokenResponse = clientBackendResponse.jwt;
  const mbAuthUrl = new URL(`${instanceUrl}/auth/sso`);
  mbAuthUrl.searchParams.set("jwt", jwtTokenResponse);
  const authSsoResponse = await fetch(mbAuthUrl, getSdkRequestHeaders(hash));

  if (!authSsoResponse.ok) {
    throw new Error(
      `Failed to fetch the session, HTTP status: ${authSsoResponse.status}`,
    );
  }
  const responseText = await authSsoResponse.text();
  try {
    return JSON.parse(responseText);
  } catch (ex) {
    return responseText;
  }
}

const refreshUserJwt = async (
  url: MetabaseAuthConfig["metabaseInstanceUrl"],
) => {
  const clientBackendResponse = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  // This should return {url: /auth/sso?jwt=[...]} with the signed token from the client backend
  return await clientBackendResponse.json();
};
