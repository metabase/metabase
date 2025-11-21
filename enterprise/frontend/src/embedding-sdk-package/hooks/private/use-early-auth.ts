import { useEffect } from "react";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { performJwtAuthFlow } from "embedding-sdk-shared/lib/jwt-auth-standalone";

/**
 * Hook to start JWT authentication early (before bundle loads).
 * Only triggers for JWT auth with jwtProviderUri specified.
 *
 * This allows auth to run in parallel with bundle download, significantly
 * reducing time-to-first-token.
 *
 * @param authConfig - The auth configuration from MetabaseProvider
 */
export function useEarlyAuth(authConfig: MetabaseAuthConfig): void {
  // @ts-expect-error - skipEarlyAuth this is a non documented property, only to be used in case of errors
  if (authConfig.skipEarlyAuth) {
    return;
  }
  const { metabaseInstanceUrl } = authConfig;

  // Only proceed for JWT auth
  const isJwtAuth = authConfig.preferredAuthMethod === "jwt";

  const jwtProviderUri =
    isJwtAuth && "jwtProviderUri" in authConfig
      ? authConfig.jwtProviderUri
      : undefined;

  const customFetchRequestToken =
    isJwtAuth && "fetchRequestToken" in authConfig
      ? authConfig.fetchRequestToken
      : undefined;

  useEffect(() => {
    // Only start early auth for JWT
    if (!isJwtAuth) {
      console.log(
        "[package] Early auth skipped (not JWT auth or no jwtProviderUri)",
      );
      return;
    }

    console.log("[package] Starting early JWT auth in parallel with bundle");

    // Start the auth flow (fire and forget)
    // The bundle will later check window.METABASE_EMBEDDING_SDK_AUTH_STATE to get results
    performJwtAuthFlow(
      metabaseInstanceUrl,
      jwtProviderUri,
      customFetchRequestToken,
    ).catch((error) => {
      // Errors are stored in window.METABASE_EMBEDDING_SDK_AUTH_STATE
      // and will be handled by the bundle's initAuth
      console.error("[package] Early JWT auth failed:", error);
    });
  }, [isJwtAuth, metabaseInstanceUrl, jwtProviderUri, customFetchRequestToken]);
}
