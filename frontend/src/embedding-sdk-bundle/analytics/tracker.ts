import { useEffect } from "react";

import {
  EMBEDDING_SDK_SCHEMA,
  useIsTrackingEnabled,
} from "embedding-sdk-bundle/analytics/component-events";
import type { SdkAuthMethod } from "embedding-sdk-bundle/analytics/snowplow";
import {
  getSdkAuthMethod,
  getSdkLocaleUsed,
  initSdkTracker,
  trackSdkEvent,
} from "embedding-sdk-bundle/analytics/snowplow";
import { setSdkTrackerReady } from "embedding-sdk-bundle/store/reducer";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";

export function deriveAuthMethod(
  authConfig: MetabaseAuthConfig,
): SdkAuthMethod {
  if (authConfig.isGuest) {
    return "guest";
  }
  if ("apiKey" in authConfig && authConfig.apiKey) {
    return "api_key";
  }
  return "sso";
}

// Initialize the SDK Snowplow tracker and fire the provider-init adoption beacon.
// Waits for anon-tracking-enabled to be loaded from the instance settings so the
// opt-out gate is respected. Fires once per JS load; idempotent under re-renders.
export function useInitSdkTracker(
  authConfig: MetabaseAuthConfig,
  reduxStore: SdkStore,
  localeUsed: boolean,
) {
  const isTrackingEnabled = useIsTrackingEnabled();

  useEffect(() => {
    if (isEmbeddingEajs() || !isTrackingEnabled) {
      return;
    }

    const authMethod = deriveAuthMethod(authConfig);
    const wasJustInitialized = initSdkTracker({
      metabaseInstanceUrl: authConfig.metabaseInstanceUrl,
      authMethod,
      localeUsed,
      store: reduxStore,
    });

    // setSdkTrackerReady unblocks per-mount hooks in child components. Set it
    // even when wasJustInitialized=false (e.g. multiple providers) so children
    // in a nested provider context can also fire.
    reduxStore.dispatch(setSdkTrackerReady(true));

    if (wasJustInitialized) {
      const sdkVersion = getSdkPackageVersion();

      trackSdkEvent({
        schema: EMBEDDING_SDK_SCHEMA,
        data: {
          component: null,
          properties: null,
          global: {
            auth_method: getSdkAuthMethod(),
            sdk_version: sdkVersion,
            locale_used: getSdkLocaleUsed(),
          },
        },
      });
    }
    // isTrackingEnabled is the only dep: fire once when the opt-out gate becomes
    // known. authConfig and reduxStore are stable across the provider lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingEnabled]);
}
