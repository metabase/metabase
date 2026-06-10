import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";

import { getSdkAuthMethod, getSdkLocaleUsed, trackSdkEvent } from "./snowplow";

export const EMBEDDING_SDK_SCHEMA =
  "iglu:com.metabase/embedding_sdk/jsonschema/1-0-0";

// CreateQuestion is intentionally excluded — it renders InteractiveQuestion with
// questionId="new", which already fires an InteractiveQuestion event (id_new: true).
// CreateQuestion is also deprecated in favour of <InteractiveQuestion questionId="new" />.
export type SdkComponentName =
  | "StaticDashboard"
  | "InteractiveDashboard"
  | "EditableDashboard"
  | "StaticQuestion"
  | "InteractiveQuestion"
  | "CollectionBrowser"
  | "MetabotQuestion"
  | "CreateDashboardModal";

type DashboardProperties = {
  with_title: boolean;
  with_downloads: boolean;
  with_subscriptions: boolean;
  auto_refresh: boolean;
  enable_entity_navigation: boolean;
};

type QuestionBaseProperties = {
  with_title: boolean;
  with_downloads: boolean;
  with_alerts: boolean;
};

type NewQuestionProperties = QuestionBaseProperties & {
  id_new: boolean;
  id_new_native: boolean;
};

export type SdkComponentProperties = {
  StaticDashboard: DashboardProperties;
  InteractiveDashboard: DashboardProperties;
  EditableDashboard: DashboardProperties;
  StaticQuestion: QuestionBaseProperties | NewQuestionProperties;
  InteractiveQuestion:
    | (QuestionBaseProperties & { is_save_enabled: boolean })
    | (NewQuestionProperties & { is_save_enabled: boolean });
  CollectionBrowser: { used: boolean };
  MetabotQuestion: { layout: "auto" | "sidebar" | "stacked" };
  CreateDashboardModal: { used: boolean };
};

// In-memory dedup registry. Module-scoped so it survives re-renders and
// React 18 StrictMode double-mounts within a single JS load.
const firedKeys = new Set<string>();

// Fire a per-mount component-usage event through the SDK tracker.
//
// Dedup: one event per (componentName, entityId) per JS load. For presence
// components (entityId = null), one event per (componentName, 'presence') per load.
// For new questions the entityId encodes the variant ('new' or 'new-native').
//
// This hook must be called inside a component that is a descendant of
// MetabaseReduxProvider (i.e. inside a ComponentProvider subtree).
//
// Timing: events wait for both anon-tracking-enabled (opt-out gate) and
// sdkTrackerReady (set by ComponentProvider after initSdkTracker completes).
// This prevents events from firing before the tracker or auth_method are ready.
export function useTrackSdkComponentMount<C extends SdkComponentName>(
  componentName: C,
  entityId: number | string | null,
  properties: SdkComponentProperties[C],
): void {
  const isTrackingEnabled = useSdkSelector(
    (state) => state.settings?.values?.["anon-tracking-enabled"] ?? false,
  );
  const isTrackerReady = useSdkSelector((state) => state.sdk.sdkTrackerReady);

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

    const serializedProperties = Object.fromEntries(
      Object.entries(
        properties as Record<string, boolean | string | null | undefined>,
      ).map(([key, value]) => [key, value == null ? null : String(value)]),
    );

    trackSdkEvent({
      schema: EMBEDDING_SDK_SCHEMA,
      data: {
        component: componentName,
        properties: serializedProperties,
        global: {
          auth_method: getSdkAuthMethod(),
          sdk_version: sdkVersion,
          locale_used: getSdkLocaleUsed(),
        },
      },
    });
    // deps are intentionally limited to the two gate flags — fires once when both
    // become true, capturing entityId and properties as a snapshot at that moment.
    // adding entityId/properties would re-fire on value changes and could produce
    // two events if entityId transitions from null to a real id after ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingEnabled, isTrackerReady]);
}
