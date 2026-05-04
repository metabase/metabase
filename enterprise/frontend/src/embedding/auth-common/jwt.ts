import * as MetabaseError from "embedding-sdk-bundle/errors";

export async function jwtDefaultRefreshTokenFunction(
  responseUrl: string,
  instanceUrl: string,
  requestHeaders: Record<string, string>,
  customFetchRequestToken: (() => Promise<any>) | null = null,
) {
  const jwtTokenResponse = await runFetchRequestToken(
    responseUrl,
    customFetchRequestToken,
  );

  const mbAuthUrl = `${instanceUrl}/auth/sso`;

  let authSsoResponse;
  try {
    authSsoResponse = await fetch(mbAuthUrl, {
      method: "POST",
      headers: {
        ...requestHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jwt: jwtTokenResponse }),
    });
  } catch (e) {
    // Network error when connecting to Metabase SSO
    throw MetabaseError.CANNOT_FETCH_JWT_TOKEN({
      url: mbAuthUrl,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (!authSsoResponse.ok) {
    // HTTP status error from Metabase SSO
    throw MetabaseError.CANNOT_FETCH_JWT_TOKEN({
      url: mbAuthUrl,
      status: String(authSsoResponse.status),
    });
  }

  try {
    // Attempt to parse JSON response
    return await authSsoResponse.json();
  } catch (ex) {
    // JSON parsing error from Metabase SSO
    // Although the requirement was specific about CUSTOM/DEFAULT for the first fetch,
    // it's reasonable to use a specific error for parsing the *Metabase* response too.
    // If a more general error is preferred here, we can adjust.
    throw MetabaseError.DEFAULT_ENDPOINT_ERROR({
      actual: ex instanceof Error ? ex.message : String(ex),
    });
  }
}

const runFetchRequestToken = async (
  responseUrl: string,
  customFetchRequestToken: (() => Promise<any>) | null = null,
) => {
  // Points to the JWT Auth endpoint on the client server
  // This should return {jwt: USER_JWT_TOKEN } with the signed token from the client backend
  try {
    const clientBackendResponse = customFetchRequestToken
      ? await customFetchRequestToken()
      : await refreshUserJwt(responseUrl);
    if (
      typeof clientBackendResponse !== "object" ||
      !("jwt" in clientBackendResponse)
    ) {
      const actualResponse = JSON.stringify(clientBackendResponse);
      if (customFetchRequestToken) {
        throw MetabaseError.CUSTOM_FETCH_REQUEST_TOKEN_ERROR({
          expected: "{ jwt: string }",
          actual: actualResponse,
        });
      }
      throw MetabaseError.DEFAULT_ENDPOINT_ERROR({
        actual: actualResponse,
      });
    }

    const jwtTokenResponse = clientBackendResponse.jwt;

    return jwtTokenResponse;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const refreshUserJwt = async (url: string) => {
  let clientBackendResponse;
  try {
    // Use window.location.origin as base to support relative URLs like "/api/sso"
    const urlWithSource = new URL(url, window.location.origin);
    urlWithSource.searchParams.set("response", "json");
    clientBackendResponse = await fetch(urlWithSource.toString(), {
      method: "GET",
      credentials: "include",
    });
  } catch (e) {
    // Network error
    throw MetabaseError.CANNOT_FETCH_JWT_TOKEN({
      url,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (!clientBackendResponse.ok) {
    // HTTP status error
    throw MetabaseError.CANNOT_FETCH_JWT_TOKEN({
      url,
      status: String(clientBackendResponse.status),
    });
  }

  const text = await clientBackendResponse.text();
  // This should return { jwt: "<signed-token>" } from the customer's auth provider
  try {
    return JSON.parse(text);
  } catch (e) {
    // JSON parsing error
    throw MetabaseError.DEFAULT_ENDPOINT_ERROR({
      actual: `"${text}"`,
    });
  }
};
