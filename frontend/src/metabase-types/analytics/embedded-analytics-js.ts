// V3-0-0 Schema Types
export type EmbeddedAnalyticsJsEventSchema = {
  event: EVENTS;
  global: {
    auth_method: AUTH_TYPES;
    locale_used?: boolean; // NEW: EMB-1334
  };
  components: ComponentData[];
};

type ComponentData = {
  name: "dashboard" | "question" | "exploration" | "browser" | "metabot";
  properties: ComponentProperty[];
};

type ComponentProperty = {
  name: string;
  values: PropertyValue[];
};

export type PropertyValue = {
  group: string; // "true", "false", "auto", "sidebar", "stacked", etc.
  value: number; // count
};

/**
 * The type of event being recorded. For example, then the Embedded Analytics JS is initialized, or when the Metabase configuration is updated.
 */
type EVENTS = "setup";

/**
 * Authentication method used for the Embedded Analytics JS.
 */
export type AUTH_TYPES = "session" | "api_key" | "sso" | "guest";

export type DefaultValues = {
  dashboard: {
    drills: boolean;
    with_downloads: boolean;
    with_title: boolean;
    with_subscriptions: boolean;
    auto_refresh_interval: boolean; // NEW: EMB-1334
    enable_entity_navigation: boolean; // NEW: EMB-1334
  };
  question: {
    drills: boolean;
    with_downloads: boolean;
    with_title: boolean;
    is_save_enabled: boolean;
    with_alerts: boolean;
    id_new_native: boolean; // NEW: EMB-1334
    id_new: boolean; // NEW: EMB-1334
  };
  exploration: {
    is_save_enabled: boolean;
  };
  browser: {
    read_only: boolean;
    enable_entity_navigation: boolean; // NEW: EMB-1334
  };
  metabot: {
    // NEW: EMB-1334
    layout: "auto" | "sidebar" | "stacked";
  };
};

type ValidateEvent<
  T extends EmbeddedAnalyticsJsEventSchema &
    Record<Exclude<keyof T, keyof EmbeddedAnalyticsJsEventSchema>, never>,
> = T;

type EmbeddedAnalyticsJsSetupEvent = ValidateEvent<{
  event: "setup";
  global: {
    auth_method: AUTH_TYPES;
    locale_used?: boolean;
  };
  components: ComponentData[];
}>;

export type EmbeddedAnalyticsJsEvent = EmbeddedAnalyticsJsSetupEvent;
