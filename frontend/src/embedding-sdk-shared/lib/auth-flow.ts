/**
 * Redux-free authentication flow that can run in both package and bundle.
 *
 * This is completely standalone with no dependencies on bundle code,
 * so it can run in the bootstrap chunk.
 */

import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { User } from "metabase-types/api";

export interface AuthFlowConfig {
  metabaseInstanceUrl: string;
  jwtProviderUri?: string;
  fetchRequestToken?: () => Promise<{ jwt: string }>;
}

export interface AuthFlowResult {
  session: MetabaseEmbeddingSessionToken;
  user: User;
  siteSettings: Record<string, any>;
}

export async function performFullAuthFlow(
  config: AuthFlowConfig,
): Promise<AuthFlowResult> {
  const log = (window as any).log(window as any).log;
  log("performFullAuthFlow", config);
  const headers = getSdkRequestHeaders();

  // Step 1: Get JWT provider URI (skip discovery if jwtProviderUri provided)
  let providerUri = config.jwtProviderUri;
  if (!providerUri) {
    const ssoUrl = new URL(`${config.metabaseInstanceUrl}/auth/sso`);
    ssoUrl.searchParams.set("preferred_method", "jwt");

    const ssoResponse = await fetch(ssoUrl.toString(), { headers });

    if (!ssoResponse.ok) {
      throw new Error(
        `Failed to discover SSO method: ${ssoResponse.status} ${ssoResponse.statusText}`,
      );
    }

    const ssoData = await ssoResponse.json();
    if (ssoData.method !== "jwt") {
      throw new Error(`SAML_NOT_SUPPORTED_IN_EARLY_AUTH`);
    }
    providerUri = ssoData.url;
  } else {
    console.log(
      "[SDK Auth Flow] Step 1: Using provided jwtProviderUri, skipping discovery",
    );
  }

  // Step 2: Get JWT from customer backend
  let jwt: string;
  if (config.fetchRequestToken) {
    console.log(
      "[SDK Auth Flow] Step 2: Fetching JWT using custom fetchRequestToken",
    );
    const response = await config.fetchRequestToken();
    if (!response || typeof response.jwt !== "string") {
      throw new Error(
        `fetchRequestToken must return { jwt: string }, got: ${JSON.stringify(response)}`,
      );
    }
    jwt = response.jwt;
  } else {
    console.log(
      "[SDK Auth Flow] Step 2: Fetching JWT from provider:",
      providerUri,
    );
    // providerUri is guaranteed to be set here (either from config or discovery)
    const jwtUrl = new URL(providerUri as string);
    jwtUrl.searchParams.set("response", "json");

    log("Fetching JWT from provider:", jwtUrl.toString());
    const jwtResponse = await fetch(jwtUrl.toString(), {
      method: "GET",
      credentials: "include",
    });
    log("JWT response:", jwtResponse.status, jwtResponse.statusText);

    if (!jwtResponse.ok) {
      throw new Error(
        `Failed to fetch JWT from provider: ${jwtResponse.status} ${jwtResponse.statusText}`,
      );
    }

    const jwtData = await jwtResponse.json();
    if (!jwtData || typeof jwtData.jwt !== "string") {
      throw new Error(
        `JWT provider must return { jwt: string }, got: ${JSON.stringify(jwtData)}`,
      );
    }
    jwt = jwtData.jwt;
  }
  console.log("[SDK Auth Flow] Step 2: Got JWT");

  // Step 3: Exchange JWT for session token
  console.log("[SDK Auth Flow] Step 3: Exchanging JWT for session token");
  const sessionUrl = new URL(`${config.metabaseInstanceUrl}/auth/sso`);
  sessionUrl.searchParams.set("jwt", jwt);

  const sessionResponse = await fetch(sessionUrl.toString(), { headers });

  if (!sessionResponse.ok) {
    throw new Error(
      `Failed to exchange JWT for session: ${sessionResponse.status} ${sessionResponse.statusText}`,
    );
  }

  const session: MetabaseEmbeddingSessionToken = await sessionResponse.json();
  console.log("[SDK Auth Flow] Step 3: Got session token");

  // Step 4: Fetch user and site settings in parallel
  console.log(
    "[SDK Auth Flow] Step 4: Fetching user and site settings in parallel",
  );
  const authHeaders = {
    ...headers,
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Session": session.id,
  };

  const [user, siteSettings] = await Promise.all([
    fetch(`${config.metabaseInstanceUrl}/api/user/current`, {
      headers: authHeaders,
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error(`Failed to fetch current user: ${r.status}`);
      }
      return r.json();
    }),
    fetch(`${config.metabaseInstanceUrl}/api/session/properties`, {
      headers: authHeaders,
    }).then(async (r) => {
      if (!r.ok) {
        throw new Error(`Failed to fetch session properties: ${r.status}`);
      }
      return r.json();
    }),
  ]);

  return { session, user, siteSettings };
}

/**
 * Performs the full JWT authentication flow without Redux.
 *
 * Steps:
 * 1. Get JWT provider URI (skip if jwtProviderUri is provided)
 * 2. Get JWT from customer backend
 * 3. Exchange JWT for session token
 * 4. Fetch user and site settings in parallel
 */
export async function performFullAuthFlowNEW(
  config: AuthFlowConfig,
): Promise<AuthFlowResult> {
  const { metabaseInstanceUrl, jwtProviderUri, fetchRequestToken } = config;

  const headers = getSdkRequestHeaders();
  console.log("SDK Auth Flow: Using headers", headers);

  // Step 1: Get JWT provider URI (skip if provided)
  let providerUri = jwtProviderUri;
  if (!providerUri) {
    const ssoUrl = `${metabaseInstanceUrl}/auth/sso?preferred_method=jwt`;
    const response = await fetch(ssoUrl, { headers });

    if (!response.ok) {
      throw new Error(
        `Failed to discover JWT provider: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    if (data.method !== "jwt") {
      throw new Error(`Expected JWT auth but got: ${data.method}`);
    }

    providerUri = data.url;
  }

  // Step 2: Get JWT from customer backend
  const jwtResponse = fetchRequestToken
    ? await fetchRequestToken()
    : await fetchJwtFromProvider(providerUri);

  if (!jwtResponse?.jwt) {
    throw new Error("JWT provider did not return a valid JWT");
  }

  // Step 3: Exchange JWT for session token
  const sessionUrl = `${metabaseInstanceUrl}/auth/sso?jwt=${jwtResponse.jwt}`;
  console.log("SDK Auth Flow: Exchanging JWT for session at", sessionUrl);
  const sessionResponse = await fetch(sessionUrl, {
    headers,
    credentials: "include",
  });

  if (!sessionResponse.ok) {
    const errorText = await sessionResponse.text().catch(() => "");
    console.error("SDK Auth Flow: JWT exchange failed", {
      status: sessionResponse.status,
      statusText: sessionResponse.statusText,
      errorText,
    });
    throw new Error(
      `Failed to exchange JWT for session: ${sessionResponse.status} ${sessionResponse.statusText}. ${errorText}`,
    );
  }

  const session = await sessionResponse.json();
  console.log("SDK Auth Flow: Got session", session);

  // Validate session
  if (!session?.id || typeof session.id !== "string") {
    throw new Error("Invalid session response: missing session ID");
  }

  // Step 4: Fetch user and site settings in parallel
  const [user, siteSettings] = await Promise.all([
    fetchCurrentUser(metabaseInstanceUrl, session.id, headers),
    fetchSiteSettings(metabaseInstanceUrl, session.id, headers),
  ]);

  return { session, user, siteSettings };
}

async function fetchJwtFromProvider(
  providerUri: string,
): Promise<{ jwt: string }> {
  const urlWithSource = new URL(providerUri);
  urlWithSource.searchParams.set("response", "json");

  const response = await fetch(urlWithSource.toString(), {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch JWT from provider: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

async function fetchCurrentUser(
  metabaseInstanceUrl: string,
  sessionToken: string,
  headers: Record<string, string>,
): Promise<User> {
  const response = await fetch(`${metabaseInstanceUrl}/api/user/current`, {
    headers: {
      ...headers,
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      "X-Metabase-Session": sessionToken,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch current user: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

async function fetchSiteSettings(
  metabaseInstanceUrl: string,
  sessionToken: string,
  headers: Record<string, string>,
): Promise<Record<string, any>> {
  const response = await fetch(
    `${metabaseInstanceUrl}/api/session/properties`,
    {
      headers: {
        ...headers,
        // eslint-disable-next-line no-literal-metabase-strings -- header name
        "X-Metabase-Session": sessionToken,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch site settings: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

function getSdkRequestHeaders(hash?: string): Record<string, string> {
  return {
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version":
      getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
      "unknown",
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}

function getSdkRequestHeaders2(): Record<string, string> {
  const version =
    getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
    "unknown";

  return {
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version": version,
  };
}
