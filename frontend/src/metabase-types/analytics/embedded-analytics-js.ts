// V3-0-0 Schema Types
export type EmbeddedAnalyticsJsEventSchema = {
  event: EVENTS;
  global: {
    auth_method: AUTH_TYPES;
    locale_used: boolean; // NEW: EMB-1334
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
    withDownloads: boolean;
    withTitle: boolean;
    withSubscriptions: boolean;
    autoRefreshInterval: boolean; // NEW: EMB-1334
    enableEntityNavigation: boolean; // NEW: EMB-1334
  };
  question: {
    drills: boolean;
    withDownloads: boolean;
    withTitle: boolean;
    isSaveEnabled: boolean;
    withAlerts: boolean;
  };
  exploration: {
    isSaveEnabled: boolean;
  };
  browser: {
    readOnly: boolean;
    enableEntityNavigation: boolean; // NEW: EMB-1334
    questionId: undefined; // NEW: EMB-1334
  };
  // NEW: EMB-1334
  metabot: {
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
    locale_used: boolean;
  };
  components: ComponentData[];
}>;

export type EmbeddedAnalyticsJsEvent = EmbeddedAnalyticsJsSetupEvent;
