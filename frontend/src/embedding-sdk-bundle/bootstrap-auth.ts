/**
 * Early auth initialization that runs in the bootstrap chunk.
 *
 * This starts authentication as soon as the auth config is available,
 * in parallel with loading the main bundle chunks.
 *
 * Uses shared auth functions from embedding/auth-common for SSO discovery,
 * JWT exchange, and session validation. Rspack inlines these into the bootstrap
 * bundle since the bootstrap entry is excluded from splitChunks.
 */

import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  validateSession,
} from "embedding/auth-common";
import * as MetabaseError from "metabase/embed/sdk-bundle/errors";

type SdkAuthState = {
  status: "idle" | "in-progress" | "completed" | "error" | "skipped";
  session?: any;
  user?: any;
  siteSettings?: Record<string, any>;
  error?: Error;
};

const SDK_AUTH_STATE_KEY = "METABASE_EMBEDDING_SDK_AUTH_STATE";

function getWindow() {
  return typeof window !== "undefined" ? window : null;
}

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
 * Wait for the auth config to be available in the provider props store,
 * then start auth immediately.
 */
function waitForAuthConfigAndStartEarlyAuthFlow() {
  const win = getWindow();
  if (!win) {
    return;
  }

  // Check if auth already started (shouldn't happen, but defensive)
  if (getAuthState()?.status) {
    return;
  }

  // Subscribe to store changes
  const checkForAuthConfigAndStartJwtAuth = () => {
    const store = win.METABASE_PROVIDER_PROPS_STORE;

    if (!store) {
      return false;
    }

    const state = store.getState();
    const authConfig = state?.props?.authConfig;

    if (authConfig) {
      startJwtAuth(authConfig);
      return true;
    }
    return false;
  };

  // Check immediately
  if (checkForAuthConfigAndStartJwtAuth()) {
    return;
  }

  // Poll for store for a second. If the provider hasn't mounted by then we'll just do normal auth
  let attempts = 0;
  const maxAttempts = 100;
  const delay = 10;
  const checkInterval = () => {
    if (attempts >= maxAttempts) {
      setAuthState({ status: "skipped" });
      return;
    }

    attempts++;

    setTimeout(() => {
      if (!checkForAuthConfigAndStartJwtAuth()) {
        checkInterval();
      }
    }, delay);
  };

  checkInterval();
}

function startJwtAuth(authConfig: any) {
  // Bail out: API key auth or SAML — these can't done in parallel
  if (
    ("apiKey" in authConfig && authConfig.apiKey) ||
    authConfig.preferredAuthMethod === "saml"
  ) {
    setAuthState({ status: "skipped" });
    return;
  }

  setAuthState({ status: "in-progress" });

  performFullAuthFlow({
    metabaseInstanceUrl: authConfig.metabaseInstanceUrl,
    jwtProviderUri:
      "jwtProviderUri" in authConfig ? authConfig.jwtProviderUri : undefined,
    preferredAuthMethod:
      "preferredAuthMethod" in authConfig
        ? authConfig.preferredAuthMethod
        : undefined,
    fetchRequestToken:
      "fetchRequestToken" in authConfig
        ? authConfig.fetchRequestToken
        : undefined,
  })
    .then((result) => {
      if (result === null) {
        // Non-JWT auth method (e.g. SAML) — fall back to normal auth
        setAuthState({ status: "skipped" });
        return;
      }
      setAuthState({
        status: "completed",
        session: result.session,
        user: result.user,
        siteSettings: result.siteSettings,
      });
    })
    .catch((error) => {
      console.error("SDK Bootstrap Auth: Auth failed:", error);
      setAuthState({ status: "error", error });
    });
}

async function performFullAuthFlow(config: {
  metabaseInstanceUrl: string;
  jwtProviderUri?: string;
  preferredAuthMethod?: string;
  fetchRequestToken?: () => Promise<{ jwt: string }>;
}): Promise<{
  session: any;
  user: any;
  siteSettings: Record<string, any>;
} | null> {
  const headers = getSdkRequestHeaders();

  // Step 1: SSO discovery (skip if jwtProviderUri provided)
  const ssoResult = config.jwtProviderUri
    ? { method: "jwt" as const, url: config.jwtProviderUri }
    : await connectToInstanceAuthSso(config.metabaseInstanceUrl, {
        headers,
        preferredAuthMethod: config.preferredAuthMethod as
          | "jwt"
          | "saml"
          | undefined,
      });

  if (ssoResult.method !== "jwt") {
    // SAML (or any non-JWT method) requires a popup — can't be pre-fetched
    return null;
  }

  // Steps 2+3: Fetch JWT from customer backend + exchange for session token
  const session = await jwtDefaultRefreshTokenFunction(
    ssoResult.url,
    config.metabaseInstanceUrl,
    getSdkRequestHeaders(ssoResult.hash),
    config.fetchRequestToken ?? null,
  );

  validateSession(session);

  // Step 4: Fetch user and site settings in parallel (bootstrap-specific)
  const authHeaders = {
    ...headers,
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Session": session.id,
  };

  const [user, siteSettings] = await Promise.all([
    fetch(`${config.metabaseInstanceUrl}/api/user/current`, {
      headers: authHeaders,
    }).then(async (r) => {
      if (!r.ok) {
        throw MetabaseError.USER_FETCH_FAILED();
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
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version":
      getWindow()?.METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO?.version ??
      "unknown",
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}

// Export the function to be called explicitly
export { waitForAuthConfigAndStartEarlyAuthFlow };
