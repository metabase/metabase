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
  const jwtTokenResponse = await runFetchRequestToken(
    responseUrl,
    customFetchRequestToken,
  );

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

const runFetchRequestToken = async (
  responseUrl: string,
  customFetchRequestToken:
    | MetabaseAuthConfig["fetchRequestToken"]
    | null = null,
) => {
  // Points to the JWT Auth endpoint on the client server
  // This should return {jwt: USER_JWT_TOKEN } with the signed token from the client backend
  try {
    const clientBackendResponse = await (
      customFetchRequestToken ?? refreshUserJwt
    )(responseUrl);

    if (!("jwt" in clientBackendResponse)) {
      throwResponseShapeError(customFetchRequestToken);
    }

    const jwtTokenResponse = clientBackendResponse.jwt;

    return jwtTokenResponse;
  } catch (e) {
    throwResponseShapeError(customFetchRequestToken);
  }
};

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

export function throwResponseShapeError(
  customFetchRequestToken:
    | MetabaseAuthConfig["fetchRequestToken"]
    | null = null,
) {
  const source = customFetchRequestToken
    ? '"fetchRequestToken" function'
    : "JWT server endpoint";

  if (customFetchRequestToken) {
    throw new Error(
      `If you are using a custom fetchRefreshToken function, you must return an object with the shape of { jwt: string } containing your JWT. Custom fetchRefreshToken functions are not supported with SAML authentication.`,
    );
  }

  throw new Error(
    `Your ${source} must return an object with the shape {jwt:string}`,
  );
}
