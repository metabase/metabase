/**
 * Early auth initialization that runs in the bootstrap chunk.
 *
 * This starts authentication as soon as the auth config is available,
 * in parallel with loading the main bundle chunks.
 */

// These are intentionally inlined (not imported from embedding-sdk-shared)
// to keep the bootstrap entry fully self-contained with zero shared modules.
// Sharing modules with the chunked entry would break the rspack runtime isolation.

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
function waitForAuthConfigAndStart() {
  const win = getWindow();
  if (!win) {
    return;
  }

  // Check if auth already started (shouldn't happen, but defensive)
  if (getAuthState()?.status) {
    return;
  }

  // Subscribe to store changes
  const checkForAuthConfig = () => {
    const store = win.METABASE_PROVIDER_PROPS_STORE;

    if (!store) {
      return false;
    }

    const state = store.getState();
    const authConfig = state?.props?.authConfig;

    if (authConfig) {
      startAuth(authConfig);
      return true;
    }
    return false;
  };

  // Check immediately
  if (checkForAuthConfig()) {
    return;
  }

  // Poll for store and config with exponential backoff
  let attempts = 0;
  const maxAttempts = 20;
  const checkInterval = () => {
    if (attempts >= maxAttempts) {
      setAuthState({ status: "skipped" });
      return;
    }

    attempts++;
    const delay = Math.min(50 * Math.pow(1.5, attempts), 500); // exponential backoff, max 500ms

    setTimeout(() => {
      if (!checkForAuthConfig()) {
        checkInterval();
      }
    }, delay);
  };

  checkInterval();
}

function startAuth(authConfig: any) {
  // Bail out: API key auth
  if ("apiKey" in authConfig && authConfig.apiKey) {
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
}> {
  const headers = getSdkRequestHeaders();

  // Step 1: Get JWT provider URI (skip discovery if jwtProviderUri provided)
  let providerUri = config.jwtProviderUri;
  if (!providerUri) {
    const ssoUrl = new URL(`${config.metabaseInstanceUrl}/auth/sso`);

    if (config.preferredAuthMethod) {
      ssoUrl.searchParams.set("preferred_method", config.preferredAuthMethod);
    }

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
  }

  // Step 2: Get JWT from customer backend
  let jwt: string;
  if (config.fetchRequestToken) {
    const response = await config.fetchRequestToken();
    if (!response || typeof response.jwt !== "string") {
      throw new Error(
        `fetchRequestToken must return { jwt: string }, got: ${JSON.stringify(response)}`,
      );
    }
    jwt = response.jwt;
  } else {
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
  // Step 3: Exchange JWT for session token
  const sessionUrl = new URL(`${config.metabaseInstanceUrl}/auth/sso`);
  sessionUrl.searchParams.set("jwt", jwt);

  const sessionResponse = await fetch(sessionUrl.toString(), { headers });

  if (!sessionResponse.ok) {
    throw new Error(
      `Failed to exchange JWT for session: ${sessionResponse.status} ${sessionResponse.statusText}`,
    );
  }

  const session = await sessionResponse.json();
  // Step 4: Fetch user and site settings in parallel
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
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version":
      // Intentionally hardcoded — cannot import getBuildInfo here without
      // creating a shared module that breaks rspack runtime isolation.
      "unknown",
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}

// Export the function to be called explicitly
export { waitForAuthConfigAndStart };
