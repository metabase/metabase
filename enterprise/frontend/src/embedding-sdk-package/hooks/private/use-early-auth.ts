import { useEffect } from "react";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { SdkAuthState } from "embedding-sdk-shared/types/auth-state";
import { SDK_AUTH_STATE_KEY } from "embedding-sdk-shared/types/auth-state";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { User } from "metabase-types/api";

function setAuthState(state: SdkAuthState): void {
  const win = getWindow();
  if (win) {
    win[SDK_AUTH_STATE_KEY] = state;
  }
}

function getAuthState(): SdkAuthState | undefined {
  return getWindow()?.[SDK_AUTH_STATE_KEY];
}

/**
 * Starts JWT authentication in the package (while bundle downloads) to improve load time.
 *
 * Bail out conditions (sets status: "skipped"):
 * - skipPackageAuth is true
 * - preferredAuthMethod is not "jwt" (SAML requires popup which needs bundle)
 * - auth already in progress or completed
 */
export function usePackageAuth(authConfig: MetabaseAuthConfig): void {
  useEffect(() => {
    // Check if auth already started (e.g., from a previous mount)
    if (getAuthState()?.status) {
      return;
    }

    // Bail out: skipPackageAuth is set
    if ("skipPackageAuth" in authConfig && authConfig.skipPackageAuth) {
      setAuthState({ status: "skipped" });
      return;
    }

    // Bail out: not JWT auth (SAML requires popup which needs bundle)

    if (
      authConfig.preferredAuthMethod !== "jwt" &&
      !("jwtProviderUri" in authConfig && authConfig.jwtProviderUri)
    ) {
      setAuthState({ status: "skipped" });
      return;
    }

    // API key auth doesn't need early auth flow
    if ("apiKey" in authConfig && authConfig.apiKey) {
      setAuthState({ status: "skipped" });
      return;
    }

    setAuthState({ status: "in-progress" });

    performFullAuthFlow(authConfig)
      .then((result) => {
        setAuthState({
          status: "completed",
          session: result.session,
          user: result.user,
          siteSettings: result.siteSettings,
        });
      })
      .catch((error) => {
        console.error("[SDK Package Auth] Error:", error);
        setAuthState({ status: "error", error });
      });
  }, [authConfig]);
}
export interface AuthFlowConfig {
  metabaseInstanceUrl: string;
  jwtProviderUri?: string;
  fetchRequestToken?: () => Promise<{ jwt: string }>;
}

export interface AuthResult {
  session: MetabaseEmbeddingSessionToken;
  user: User;
  siteSettings: Record<string, unknown>;
}

/**
 * Performs the full JWT authentication flow without Redux dependencies.
 * Can be used by both package (early auth) and bundle.
 *
 * Steps:
 * 1. Discover JWT provider (if not provided via jwtProviderUri)
 * 2. Get JWT from customer backend
 * 3. Exchange JWT for session token
 * 4. Fetch user and site settings in parallel
 */
export async function performFullAuthFlow(
  config: AuthFlowConfig,
): Promise<AuthResult> {
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

    const jwtResponse = await fetch(jwtUrl.toString(), {
      method: "GET",
      credentials: "include",
    });

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
