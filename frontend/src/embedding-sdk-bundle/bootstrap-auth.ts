/**
 * Early auth initialization that runs in the bootstrap chunk.
 *
 * This starts authentication as soon as the auth config is available,
 * in parallel with loading the main bundle chunks.
 */

// import { getWindow } from "embedding-sdk-shared/lib/get-window";
// import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
// import type { SdkAuthState } from "embedding-sdk-shared/types/auth-state";
// import { SDK_AUTH_STATE_KEY } from "embedding-sdk-shared/types/auth-state";

const SDK_AUTH_STATE_KEY = "METABASE_EMBEDDING_SDK_AUTH_STATE";

export function getWindow() {
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
function waitForAuthConfigAndStart({ startTime }: { startTime: Date }) {
  const after = () => `after ${new Date().getTime() - startTime.getTime()} ms`;
  const log = (message: string, ...args: any[]) =>
    console.log(`SDK Bootstrap Auth: ${message} ${after()}`, ...args);
  const win = getWindow();
  if (!win) {
    log("No window, skipping");
    return;
  }

  // Check if auth already started (shouldn't happen, but defensive)
  if (getAuthState()?.status) {
    log("Auth already started, skipping");
    return;
  }

  log("Watching for auth config...");

  // Subscribe to store changes
  const checkForAuthConfig = () => {
    const store = win.METABASE_PROVIDER_PROPS_STORE;

    if (!store) {
      log("Store not ready yet");
      return false;
    }

    const state = store.getState();
    const authConfig = state?.props?.authConfig;

    log("Checking store", {
      hasStore: !!store,
      hasState: !!state,
      hasProps: !!state?.props,
      hasAuthConfig: !!authConfig,
    });

    if (authConfig) {
      log(`Auth config found`, authConfig);
      startAuth(authConfig, { log });
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
      console.log(
        "SDK Bootstrap Auth: Gave up waiting for auth config, will use bundle auth",
      );
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

function startAuth(
  authConfig: any,
  { log }: { log: (message: string, ...args: any[]) => void },
) {
  // Bail out: not JWT auth or no jwtProviderUri
  const isJwtAuth =
    ("jwtProviderUri" in authConfig && authConfig.jwtProviderUri) ||
    ("preferredAuthMethod" in authConfig &&
      authConfig.preferredAuthMethod === "jwt");

  if (!isJwtAuth) {
    log("Not JWT auth, skipping early auth");
    setAuthState({ status: "skipped" });
    return;
  }

  // Bail out: API key auth
  if ("apiKey" in authConfig && authConfig.apiKey) {
    log("API key auth, skipping early auth");
    setAuthState({ status: "skipped" });
    return;
  }

  // Bail out: skipPackageAuth is set
  if ("skipPackageAuth" in authConfig && authConfig.skipPackageAuth) {
    log("skipPackageAuth is set, skipping");
    setAuthState({ status: "skipped" });
    return;
  }

  log("Starting JWT auth flow");
  setAuthState({ status: "in-progress" });

  performFullAuthFlow({
    metabaseInstanceUrl: authConfig.metabaseInstanceUrl,
    jwtProviderUri:
      "jwtProviderUri" in authConfig ? authConfig.jwtProviderUri : undefined,
    fetchRequestToken:
      "fetchRequestToken" in authConfig
        ? authConfig.fetchRequestToken
        : undefined,
  })
    .then((result) => {
      log("Auth completed successfully", result);
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

    console.log(
      "[SDK Auth Flow] Fetching JWT from provider:",
      jwtUrl.toString(),
    );
    const jwtResponse = await fetch(jwtUrl.toString(), {
      method: "GET",
      credentials: "include",
    });
    console.log(
      "[SDK Auth Flow] JWT response:",
      jwtResponse.status,
      jwtResponse.statusText,
    );

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

  const session = await sessionResponse.json();
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
      // getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
      "unknown",
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}

// Export the function to be called explicitly
export { waitForAuthConfigAndStart };
