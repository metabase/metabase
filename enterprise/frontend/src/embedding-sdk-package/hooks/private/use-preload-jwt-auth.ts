import { useEffect, useMemo, useState } from "react";

import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  validateSession,
} from "embedding/auth-common";
import * as MetabaseError from "embedding-sdk-bundle/errors";
import type {
  MetabaseAuthConfig,
  MetabaseAuthConfigWithJwt,
} from "embedding-sdk-bundle/types/auth-config";
import {
  getJwtAuthBridgeState,
  getJwtAuthRequestSignature,
} from "embedding-sdk-shared/lib/sdk-auth-bridge";
import {
  getPerfNow,
  logPerfDuration,
  logPerfEvent,
} from "embedding-sdk-shared/lib/logging/perf-logger";
import { getSdkRequestHeaders } from "embedding-sdk-shared/lib/get-sdk-request-headers";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

export function usePreloadJwtAuth(authConfig: MetabaseAuthConfig) {
  const shouldPreload = shouldPreloadJwt(authConfig);
  const [isReady, setIsReady] = useState(!shouldPreload);

  const { metabaseInstanceUrl, preferredAuthMethod } = authConfig;
  const fetchRequestToken = (authConfig as MetabaseAuthConfigWithJwt)
    .fetchRequestToken;

  const preloadDeps = useMemo(
    () => ({
      metabaseInstanceUrl,
      preferredAuthMethod,
      fetchRequestToken,
    }),
    [metabaseInstanceUrl, preferredAuthMethod, fetchRequestToken],
  );

  useEffect(() => {
    if (!shouldPreload) {
      setIsReady(true);
      return;
    }

    if (!getWindow()) {
      setIsReady(true);
      return;
    }

    startPackageJwtAuth(authConfig);
    setIsReady(true);
  }, [authConfig, shouldPreload, preloadDeps]);

  return isReady;
}

function shouldPreloadJwt(
  authConfig: MetabaseAuthConfig,
): authConfig is MetabaseAuthConfigWithJwt {
  return (
    !("apiKey" in authConfig && authConfig.apiKey) &&
    authConfig.preferredAuthMethod === "jwt"
  );
}

export function startPackageJwtAuth(
  authConfig: MetabaseAuthConfigWithJwt,
): Promise<MetabaseEmbeddingSessionToken | null> | void {
  if (!getWindow()) {
    return;
  }

  const startTime = getPerfNow();
  const signature = getJwtAuthRequestSignature({
    metabaseInstanceUrl: authConfig.metabaseInstanceUrl,
    preferredAuthMethod: authConfig.preferredAuthMethod,
  });
  const bridgeState = getJwtAuthBridgeState();

  if (
    bridgeState.configSignature === signature &&
    (bridgeState.status === "pending" || bridgeState.status === "fulfilled")
  ) {
    logPerfEvent("package-auth", "reuse jwt auth result", {
      instanceUrl: authConfig.metabaseInstanceUrl,
      status: bridgeState.status,
    });
    return bridgeState.promise ?? undefined;
  }

  logPerfEvent("package-auth", "start jwt auth request", {
    instanceUrl: authConfig.metabaseInstanceUrl,
    preferredAuthMethod: authConfig.preferredAuthMethod,
  });

  const promise = fetchJwtSession(authConfig);

  bridgeState.status = "pending";
  bridgeState.promise = promise;
  bridgeState.token = null;
  bridgeState.error = null;
  bridgeState.method = "jwt";
  bridgeState.configSignature = signature;

  promise
    .then((token) => {
      bridgeState.status = "fulfilled";
      bridgeState.token = token ?? null;
      bridgeState.promise = null;
      logPerfDuration("package-auth", "jwt auth resolved", startTime, {
        instanceUrl: authConfig.metabaseInstanceUrl,
      });
    })
    .catch((error) => {
      bridgeState.status = "rejected";
      bridgeState.error = error;
      bridgeState.token = null;
      bridgeState.promise = null;
      logPerfDuration("package-auth", "jwt auth failed", startTime, {
        instanceUrl: authConfig.metabaseInstanceUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return promise;
}

export async function fetchJwtSession(authConfig: MetabaseAuthConfigWithJwt) {
  const urlResponseJson = await connectToInstanceAuthSso(
    authConfig.metabaseInstanceUrl,
    {
      preferredAuthMethod: authConfig.preferredAuthMethod,
      headers: getSdkRequestHeaders(),
    },
  );

  const { method, url: responseUrl, hash } = urlResponseJson || {};

  if (method !== "jwt") {
    throw MetabaseError.INVALID_AUTH_METHOD({ method });
  }

  const session = await jwtDefaultRefreshTokenFunction(
    responseUrl,
    authConfig.metabaseInstanceUrl,
    getSdkRequestHeaders({ hash }),
    authConfig.fetchRequestToken,
  );
  validateSession(session);

  return session;
}
