import { useEffect } from "react";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { isEmbeddingEajs, isEmbeddingSdk } from "metabase/embedding-sdk/config";

import {
  setSdkTrackingContext,
  useIsTrackingEnabled,
} from "./component-events";
import {
  type SdkAuthMethod,
  initSdkTracker,
  trackSdkSimpleEvent,
} from "./snowplow";

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

// Module-level flag so the beacon fires once per JS load regardless of how many
// ComponentProvider instances mount.
let beaconFired = false;

// Reset module state for testing. Not called in production.
export function __resetBeaconForTesting() {
  beaconFired = false;
}

// Initialize SDK analytics context and fire the provider-init adoption beacon.
// Waits for anon-tracking-enabled to be loaded from instance settings so the
// opt-out gate is respected. Fires once per JS load; idempotent under re-renders.
//
// setSdkTrackingContext is called synchronously during render (not in an effect)
// so child component effects can read auth_method on the very first commit.
export function useInitSdkTracker(
  authConfig: MetabaseAuthConfig,
  localeUsed: boolean,
) {
  const isTrackingEnabled = useIsTrackingEnabled();
  const authMethod = deriveAuthMethod(authConfig);

  setSdkTrackingContext(authMethod, localeUsed);

  useEffect(() => {
    if (!isEmbeddingSdk() || isEmbeddingEajs() || !isTrackingEnabled) {
      return;
    }
    if (beaconFired) {
      return;
    }

    // Initialize the Snowplow proxy tracker before the first event. Idempotent.
    initSdkTracker({ metabaseInstanceUrl: authConfig.metabaseInstanceUrl });
    beaconFired = true;

    trackSdkSimpleEvent({
      event: "embedding_sdk_initialized",
      event_detail: JSON.stringify({
        sdk_version: getSdkPackageVersion(),
        auth_method: authMethod,
        locale_used: localeUsed,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingEnabled]);
}
