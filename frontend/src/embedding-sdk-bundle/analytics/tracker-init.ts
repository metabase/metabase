import { useEffect } from "react";

import { EMBEDDING_SDK_SCHEMA } from "embedding-sdk-bundle/analytics/events";
import {
  getSdkAuthMethod,
  getSdkLocaleUsed,
  initSdkTracker,
  trackSdkEvent,
} from "embedding-sdk-bundle/analytics/snowplow";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { setSdkTrackerReady } from "embedding-sdk-bundle/store/reducer";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";

export function deriveAuthMethod(authConfig: MetabaseAuthConfig): string {
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
export function useSdkTrackerInit(
  authConfig: MetabaseAuthConfig,
  reduxStore: SdkStore,
  localeUsed: boolean,
) {
  const isTrackingEnabled = useSdkSelector(
    (state) => state.settings?.values?.["anon-tracking-enabled"] ?? false,
  );

  useEffect(() => {
    if (!isTrackingEnabled) {
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
      const sdkVersion =
        getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ??
        null;

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
