import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { useSetting } from "metabase/common/hooks";
import { isEmbeddingEajs, isEmbeddingSdk } from "metabase/embedding-sdk/config";

import { getSdkAuthMethod, getSdkLocaleUsed, trackSdkEvent } from "./snowplow";

export function useIsTrackingEnabled(): boolean {
  // Default false so we don't fire events during the settings-load window for users who opted out.
  return useSetting("anon-tracking-enabled") ?? false;
}

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

// StaticDashboard omits enableEntityNavigation from its public props —
// entity navigation requires drill-through, which static mode doesn't support.
type StaticDashboardProperties = {
  with_title: boolean;
  with_downloads: boolean;
  with_subscriptions: boolean;
  auto_refresh: boolean;
};

type DashboardProperties = StaticDashboardProperties & {
  enable_entity_navigation: boolean;
};

type QuestionBaseProperties = {
  with_title: boolean;
  with_downloads: boolean;
  with_alerts: boolean;
};

// CollectionBrowser and CreateDashboardModal have no configurable dimensions —
// the event itself signals presence. Sending { used: true } was always trivially
// true and added no analytical signal, so we send empty properties instead.
type EmptyProperties = Record<never, never>;

type NewQuestionProperties = QuestionBaseProperties & {
  id_new: boolean;
  id_new_native: boolean;
};

export type SdkComponentProperties = {
  StaticDashboard: StaticDashboardProperties;
  InteractiveDashboard: DashboardProperties;
  EditableDashboard: DashboardProperties;
  StaticQuestion: QuestionBaseProperties | NewQuestionProperties;
  InteractiveQuestion: (QuestionBaseProperties | NewQuestionProperties) & {
    is_save_enabled: boolean;
  };
  CollectionBrowser: EmptyProperties;
  MetabotQuestion: { layout: "auto" | "sidebar" | "stacked" };
  CreateDashboardModal: EmptyProperties;
};

// Centralized defaults. Components pass raw prop values (undefined when the
// user omits an optional prop); the hook fills gaps by merging these defaults
// over only the defined values. id_new and id_new_native are excluded because
// they are always set explicitly by the component.
const SDK_COMPONENT_DEFAULT_PROPERTIES: {
  [C in SdkComponentName]: Partial<SdkComponentProperties[C]>;
} = {
  StaticDashboard: {
    with_title: true,
    with_downloads: false,
    with_subscriptions: false,
    auto_refresh: false,
  },
  InteractiveDashboard: {
    with_title: true,
    with_downloads: false,
    with_subscriptions: false,
    auto_refresh: false,
    enable_entity_navigation: false,
  },
  EditableDashboard: {
    with_title: true,
    with_downloads: false,
    with_subscriptions: false,
    auto_refresh: false,
    enable_entity_navigation: false,
  },
  StaticQuestion: {
    with_title: false,
    with_downloads: false,
    with_alerts: false,
  },
  InteractiveQuestion: {
    with_title: true,
    with_downloads: false,
    with_alerts: false,
    is_save_enabled: true,
  },
  CollectionBrowser: {},
  MetabotQuestion: { layout: "auto" },
  CreateDashboardModal: {},
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
// Without the sdkTrackerReady gate, firing early would either silently drop the
// event (Snowplow discards calls before newTracker runs) or record auth_method
// as undefined because initSdkTracker hasn't written it yet.
export function useTrackSdkComponentMount<C extends SdkComponentName>(
  componentName: C,
  entityId: number | string | null,
  properties: Partial<SdkComponentProperties[C]>,
): void {
  const isTrackingEnabled = useIsTrackingEnabled();
  const isTrackerReady = useSdkSelector((state) => state.sdk.sdkTrackerReady);

  useEffect(() => {
    if (!isEmbeddingSdk() || isEmbeddingEajs()) {
      return;
    }
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

    const sdkVersion = getSdkPackageVersion();

    const definedProperties = Object.fromEntries(
      Object.entries(properties as Record<string, unknown>).filter(
        ([, value]) => value !== undefined,
      ),
    );
    const mergedProperties = {
      ...SDK_COMPONENT_DEFAULT_PROPERTIES[componentName],
      ...definedProperties,
    } as SdkComponentProperties[C];

    const serializedProperties = Object.fromEntries(
      Object.entries(
        mergedProperties as Record<string, boolean | string | null | undefined>,
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
