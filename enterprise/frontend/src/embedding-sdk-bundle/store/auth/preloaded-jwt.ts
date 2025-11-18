import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

import {
  getJwtAuthBridgeState,
  getJwtAuthRequestSignature,
} from "embedding-sdk-shared/lib/sdk-auth-bridge";

const PRELOADED_JWT_WAIT_TIMEOUT_MS = 4000;

export async function consumePreloadedJwtToken({
  metabaseInstanceUrl,
  preferredAuthMethod,
}: Pick<
  MetabaseAuthConfig,
  "metabaseInstanceUrl" | "preferredAuthMethod"
>): Promise<MetabaseEmbeddingSessionToken | null> {
  console.log("consumePreloadedJwtToken", {
    metabaseInstanceUrl,
    preferredAuthMethod,
  });
  if (preferredAuthMethod !== "jwt") {
    return null;
  }

  const bridgeState = getJwtAuthBridgeState();
  const expectedSignature = getJwtAuthRequestSignature({
    metabaseInstanceUrl,
    preferredAuthMethod,
  });

  if (
    !areSignaturesCompatible(bridgeState.configSignature, expectedSignature)
  ) {
    return null;
  }

  if (bridgeState.status === "fulfilled") {
    console.log("consumePreloadedJwtToken - fulfilled", {
      token: bridgeState.token,
    });
    return bridgeState.token ?? null;
  }

  if (
    bridgeState.status === "pending" &&
    bridgeState.promise &&
    bridgeState.method === "jwt"
  ) {
    try {
      return await withTimeout(
        bridgeState.promise,
        PRELOADED_JWT_WAIT_TIMEOUT_MS,
      );
    } catch {
      return null;
    }
  }

  return null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export { PRELOADED_JWT_WAIT_TIMEOUT_MS };

function areSignaturesCompatible(
  actualSignature: string | null,
  expectedSignature: string,
) {
  if (!actualSignature) {
    return false;
  }

  if (actualSignature === expectedSignature) {
    return true;
  }

  try {
    const parsedActual = JSON.parse(actualSignature) as Record<string, unknown>;
    const parsedExpected = JSON.parse(
      expectedSignature,
    ) as Record<string, unknown>;

    return (
      parsedActual.metabaseInstanceUrl ===
        parsedExpected.metabaseInstanceUrl &&
      parsedActual.preferredAuthMethod ===
        parsedExpected.preferredAuthMethod
    );
  } catch {
    return false;
  }
}
