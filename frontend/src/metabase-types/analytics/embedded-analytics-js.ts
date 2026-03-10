export type EmbeddedAnalyticsJsEventSchema = {
  event: EVENTS;
  global: {
    auth_method: AUTH_TYPES;
  };
  dashboard?: {
    drills: BOOLEAN_COUNT;
    with_downloads: BOOLEAN_COUNT;
    with_title: BOOLEAN_COUNT;
    with_subscriptions: BOOLEAN_COUNT;
  };
  question?: {
    drills: BOOLEAN_COUNT;
    with_downloads: BOOLEAN_COUNT;
    with_title: BOOLEAN_COUNT;
    is_save_enabled: BOOLEAN_COUNT;
    with_alerts: BOOLEAN_COUNT;
  };
  exploration?: {
    is_save_enabled: BOOLEAN_COUNT;
  };
  browser?: {
    read_only: BOOLEAN_COUNT;
  };
};

/**
 * The type of event being recorded. For example, then the Embedded Analytics JS is initialized, or when the Metabase configuration is updated.
 */
type EVENTS = "setup";

/**
 * Authentication method used for the Embedded Analytics JS.
 */
export type AUTH_TYPES = "session" | "api_key" | "sso" | "guest";

type BOOLEAN_COUNT = {
  true: number;
  false: number;
};

export type DefaultValues = {
  dashboard: Record<
    keyof NonNullable<EmbeddedAnalyticsJsEventSchema["dashboard"]>,
    boolean
  >;
  question: Record<
    keyof NonNullable<EmbeddedAnalyticsJsEventSchema["question"]>,
    boolean
  >;
  exploration: Record<
    keyof NonNullable<EmbeddedAnalyticsJsEventSchema["exploration"]>,
    boolean
  >;
  browser: Record<
    keyof NonNullable<EmbeddedAnalyticsJsEventSchema["browser"]>,
    boolean
  >;
};

type ValidateEvent<
  T extends EmbeddedAnalyticsJsEventSchema &
    Record<Exclude<keyof T, keyof EmbeddedAnalyticsJsEventSchema>, never>,
> = T;

type EmbeddedAnalyticsJsSetupEvent = ValidateEvent<{
  event: "setup";
  global: {
    auth_method: AUTH_TYPES;
  };
  dashboard?: {
    drills: BOOLEAN_COUNT;
    with_downloads: BOOLEAN_COUNT;
    with_title: BOOLEAN_COUNT;
    with_subscriptions: BOOLEAN_COUNT;
  };
  question?: {
    drills: BOOLEAN_COUNT;
    with_downloads: BOOLEAN_COUNT;
    with_title: BOOLEAN_COUNT;
    is_save_enabled: BOOLEAN_COUNT;
    with_alerts: BOOLEAN_COUNT;
  };
  exploration?: {
    is_save_enabled: BOOLEAN_COUNT;
  };
  browser?: {
    read_only: BOOLEAN_COUNT;
  };
}>;

export type EmbeddedAnalyticsJsEvent = EmbeddedAnalyticsJsSetupEvent;
