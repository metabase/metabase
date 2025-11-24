import * as MetabaseError from "embedding-sdk-bundle/errors";
import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
} from "embedding/auth-common";
import type { SdkAuthState } from "embedding-sdk-shared/types/auth-state";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import { EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION } from "build-configs/embedding-sdk/constants/versions";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { MetabaseFetchRequestTokenFn } from "metabase/embedding-sdk/types/refresh-token";

const AUTH_STATE_KEY = "METABASE_EMBEDDING_SDK_AUTH_STATE";

/**
 * Get the current auth state from window, initializing if needed
 */
function getAuthState(): SdkAuthState {
  const win = getWindow();
  if (!win) {
    throw new Error("Cannot access window object");
  }

  if (!win[AUTH_STATE_KEY]) {
    win[AUTH_STATE_KEY] = {
      status: "idle",
    };
  }

  return win[AUTH_STATE_KEY];
}

/**
 * Update the auth state in window
 */
function updateAuthState(updates: Partial<SdkAuthState>): void {
  const win = getWindow();
  if (!win) {
    return;
  }

  win[AUTH_STATE_KEY] = {
    ...getAuthState(),
    ...updates,
  };
}

/**
 * Get SDK request headers for auth requests
 */
function getSdkRequestHeaders(hash?: string): Record<string, string> {
  return {
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client": "embedding-sdk-react",
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    "X-Metabase-Client-Version":
      getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
      EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
    // eslint-disable-next-line no-literal-metabase-strings -- header name
    ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
  };
}

/**
 * Fetch current user from Metabase API
 */
async function fetchCurrentUser(
  metabaseInstanceUrl: string,
  sessionToken: string,
): Promise<any> {
  const response = await fetch(`${metabaseInstanceUrl}/api/user/current`, {
    headers: {
      ...getSdkRequestHeaders(),
      // eslint-disable-next-line no-literal-metabase-strings -- header name
      "X-Metabase-Session": sessionToken,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch site settings from Metabase API
 */
async function fetchSiteSettings(
  metabaseInstanceUrl: string,
  sessionToken: string,
): Promise<any> {
  const response = await fetch(
    `${metabaseInstanceUrl}/api/session/properties`,
    {
      headers: {
        ...getSdkRequestHeaders(),
        // eslint-disable-next-line no-literal-metabase-strings -- header name
        "X-Metabase-Session": sessionToken,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch site settings: ${response.status}`);
  }

  return response.json();
}

/**
 * Performs the complete JWT authentication flow without Redux.
 * Stores results in window.METABASE_EMBEDDING_SDK_AUTH_STATE for the bundle to consume.
 *
 * Flow:
 * 1. Discover JWT provider URI (if not provided via jwtProviderUri config)
 * 2. Fetch JWT from customer backend
 * 3. Exchange JWT for session token with Metabase
 *
 * @param metabaseInstanceUrl - The Metabase instance URL
 * @param jwtProviderUri - Optional direct JWT provider URI (skips discovery)
 * @param customFetchRequestToken - Optional custom function to fetch JWT
 */
export async function performJwtAuthFlow(
  metabaseInstanceUrl: string,
  jwtProviderUri?: string,
  customFetchRequestToken?: MetabaseFetchRequestTokenFn,
): Promise<void> {
  const authState = getAuthState();

  // Don't restart if already in progress or completed
  if (authState.status === "in-progress" || authState.status === "completed") {
    console.log(
      "[package] JWT auth already in progress or completed, skipping",
      authState.status,
    );
    return;
  }

  console.log("[package] Starting JWT auth flow");
  updateAuthState({ status: "in-progress" });

  try {
    // Step 1: Get JWT provider URI (either from config or via discovery)
    let providerUri: string;
    let hash: string | undefined;

    if (jwtProviderUri) {
      // Skip discovery if jwtProviderUri is provided
      console.log("[package] Using provided jwtProviderUri:", jwtProviderUri);
      providerUri = jwtProviderUri;
    } else {
      // Discover JWT provider URI via /auth/sso
      console.log("[package] Discovering JWT provider URI via /auth/sso");
      const urlResponseJson = await connectToInstanceAuthSso(
        metabaseInstanceUrl,
        {
          preferredAuthMethod: "jwt",
          headers: getSdkRequestHeaders(),
        },
      );

      if (urlResponseJson.method !== "jwt" || !urlResponseJson.url) {
        throw MetabaseError.INVALID_AUTH_METHOD({
          method: urlResponseJson.method,
        });
      }

      providerUri = urlResponseJson.url;
      hash = urlResponseJson.hash;
      console.log("[package] Discovered JWT provider URI:", providerUri);
    }

    updateAuthState({ jwtProviderUri: providerUri });

    // Step 2 & 3: Fetch JWT and exchange for session token
    console.log("[package] Fetching JWT and exchanging for session token");
    const session = await jwtDefaultRefreshTokenFunction(
      providerUri,
      metabaseInstanceUrl,
      getSdkRequestHeaders(hash),
      customFetchRequestToken ?? null,
    );

    console.log("[package] JWT auth completed successfully");

    // Step 4: Prefetch user and site settings with the session token
    console.log("[package] Prefetching user and site settings");
    const [user, siteSettings] = await Promise.all([
      fetchCurrentUser(metabaseInstanceUrl, session.id),
      fetchSiteSettings(metabaseInstanceUrl, session.id),
    ]);

    console.log("[package] Prefetch completed, storing all results");
    updateAuthState({
      status: "completed",
      session,
      user,
      siteSettings,
    });
  } catch (error) {
    console.error("[package] JWT auth failed:", error);
    updateAuthState({
      status: "error",
      error: error as Error,
    });

    throw error;
  }
}

/**
 * Wait for auth flow to complete by polling the auth state.
 * Returns the session token once auth is complete.
 *
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
 * @param pollIntervalMs - How often to check the state (default: 100)
 */
export async function waitForAuthCompletion(
  timeoutMs = 30000,
  pollIntervalMs = 100,
): Promise<void> {
  const startTime = Date.now();
  let pollCount = 0;

  console.log("[bundle] Waiting for package auth to complete...");

  while (Date.now() - startTime < timeoutMs) {
    const authState = getAuthState();
    pollCount++;

    if (authState.status === "completed") {
      console.log(
        `[bundle] Package auth completed after ${pollCount} polls (${Date.now() - startTime}ms)`,
      );
      return;
    }

    if (authState.status === "error") {
      console.error("[bundle] Package auth failed:", authState.error);
      throw authState.error || new Error("Auth failed with unknown error");
    }

    // Wait before checking again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.error("[bundle] Auth completion timeout after", timeoutMs, "ms");
  throw new Error("Auth completion timeout");
}

/**
 * Get the current auth state (read-only)
 */
export function readAuthState(): SdkAuthState {
  return getAuthState();
}

/**
 * Reset the auth state (useful for testing or re-authentication)
 */
export function resetAuthState(): void {
  updateAuthState({
    status: "idle",
    jwtProviderUri: undefined,
    jwtToken: undefined,
    session: undefined,
    error: undefined,
  });
}
