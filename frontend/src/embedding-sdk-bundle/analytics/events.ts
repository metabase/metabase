import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";

import { getSdkAuthMethod, getSdkLocaleUsed, trackSdkEvent } from "./snowplow";

export const EMBEDDING_SDK_SCHEMA =
  "iglu:com.metabase/embedding_sdk/jsonschema/1-0-0";

export type SdkComponentName =
  | "StaticDashboard"
  | "InteractiveDashboard"
  | "EditableDashboard"
  | "StaticQuestion"
  | "InteractiveQuestion"
  | "CollectionBrowser"
  | "MetabotQuestion";

// In-memory dedup registry. Module-scoped so it survives re-renders and
// React 18 StrictMode double-mounts within a single JS load.
const firedKeys = new Set<string>();

// Fire a per-mount component-usage event through the SDK tracker.
//
// Dedup: one event per (componentName, entityId) per JS load. For presence
// components (entityId = null), one event per (componentName, 'presence') per load.
// For new questions the entityId encodes the variant ('new' or 'new-native').
//
// This hook MUST be called inside a component that is a descendant of
// MetabaseReduxProvider (i.e. inside a ComponentProvider subtree).
//
// Timing: events wait for both anon-tracking-enabled (opt-out gate) AND
// sdkTrackerReady (set by ComponentProvider after initSdkTracker completes).
// This prevents events from firing before the tracker or auth_method are ready.
export const useTrackSdkComponentMount = (
  componentName: SdkComponentName,
  entityId: number | string | null,
  properties: Record<string, unknown>,
): void => {
  const isTrackingEnabled = useSdkSelector((state) =>
    Boolean(state.settings?.values?.["anon-tracking-enabled"]),
  );
  const isTrackerReady = useSdkSelector((state) =>
    Boolean(state.sdk.sdkTrackerReady),
  );

  useEffect(() => {
    if (!isTrackingEnabled || !isTrackerReady) {
      return;
    }

    const dedupKey =
      entityId !== null
        ? `${componentName}:${String(entityId)}`
        : `${componentName}:presence`;

    if (firedKeys.has(dedupKey)) {
      return;
    }
    firedKeys.add(dedupKey);

    const sdkVersion =
      getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO").version ?? null;

    trackSdkEvent({
      schema: EMBEDDING_SDK_SCHEMA,
      data: {
        component: componentName,
        properties,
        global: {
          auth_method: getSdkAuthMethod(),
          sdk_version: sdkVersion,
          locale_used: getSdkLocaleUsed(),
        },
      },
    });
    // isTrackingEnabled and isTrackerReady are the only deps — we fire once
    // when both become true. Properties and entityId are read at that point and
    // the dedup guard prevents any re-fire even if the effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingEnabled, isTrackerReady]);
};
