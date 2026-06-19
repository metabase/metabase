import { useEffect, useRef } from "react";

import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { useSetting } from "metabase/common/hooks";
import { isEmbeddingEajs, isEmbeddingSdk } from "metabase/embedding-sdk/config";

import { type SdkAuthMethod, trackSdkSimpleEvent } from "./snowplow";

export function useIsTrackingEnabled(): boolean {
  // Default false so we don't fire events during the settings-load window for users who opted out.
  return useSetting("anon-tracking-enabled") ?? false;
}

// Module-level state set synchronously during ComponentProvider render so child
// component effects can read the correct values on the first commit.
let sdkAuthMethod: SdkAuthMethod | undefined;
let sdkLocaleUsed = false;

export function setSdkTrackingContext(
  authMethod: SdkAuthMethod,
  localeUsed: boolean,
) {
  sdkAuthMethod = authMethod;
  sdkLocaleUsed = localeUsed;
}

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

// Counter for assigning unique keys to component instances. Incremented once
// per useRef initialization (i.e. once per component mount), so two instances
// of the same component type get distinct keys even with the same entityId.
let nextInstanceId = 0;

// Fire a per-mount component-usage event via trackSimpleEvent.
//
// Dedup: one event per component instance per JS load. The dedup key is
// instance-scoped so that two mounted instances of the same component type
// each fire their own event. React 18 StrictMode double-mounts are also
// deduplicated because useRef returns the same value across re-renders.
//
// This hook must be called inside a component that is a descendant of
// ComponentProvider (i.e. inside a ComponentProvider subtree).
export function useTrackSdkComponentMount<C extends SdkComponentName>(
  componentName: C,
  _entityId: number | string | null,
  properties: Partial<SdkComponentProperties[C]>,
): void {
  const isTrackingEnabled = useIsTrackingEnabled();
  const instanceKey = useRef(`${componentName}:instance:${nextInstanceId++}`);

  useEffect(() => {
    if (!isEmbeddingSdk() || isEmbeddingEajs()) {
      return;
    }
    if (!isTrackingEnabled) {
      return;
    }

    const dedupKey = instanceKey.current;
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

    trackSdkSimpleEvent({
      event: "embedding_sdk_component_rendered",
      triggered_from: componentName,
      event_detail: JSON.stringify({
        sdk_version: sdkVersion,
        auth_method: sdkAuthMethod,
        locale_used: sdkLocaleUsed,
        ...serializedProperties,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingEnabled]);
}
