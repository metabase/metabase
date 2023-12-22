export interface FormattingSettings {
  "type/Temporal"?: DateFormattingSettings;
  "type/Number"?: NumberFormattingSettings;
  "type/Currency"?: CurrencyFormattingSettings;
}

export interface DateFormattingSettings {
  date_style?: string;
  date_separator?: string;
  date_abbreviate?: boolean;
  time_style?: string;
}

export interface NumberFormattingSettings {
  number_separators?: string;
}

export interface CurrencyFormattingSettings {
  currency?: string;
  currency_style?: string;
  currency_in_header?: boolean;
}

export interface Engine {
  "driver-name": string;
  "details-fields"?: EngineField[];
  source: EngineSource;
  "superseded-by": string | null;
}

export interface EngineField {
  name: string;
  type?: EngineFieldType;
  "display-name"?: string;
  description?: string;
  "helper-text"?: string;
  placeholder?: unknown;
  required?: boolean;
  default?: unknown;
  options?: EngineFieldOption[];
  "visible-if"?: Record<string, unknown>;
  "treat-before-posting"?: EngineFieldTreatType;
}

export type EngineFieldType =
  | "string"
  | "password"
  | "text"
  | "integer"
  | "boolean"
  | "select"
  | "textFile"
  | "info"
  | "section";

export type EngineFieldTreatType = "base64";

export interface EngineFieldOption {
  name: string;
  value: string;
}

export interface EngineSource {
  type: "official" | "community" | "partner";
  contact: EngineSourceContact | null;
}

export interface EngineSourceContact {
  name?: string;
  address?: string;
}

export interface ScheduleSettings {
  schedule_type?: ScheduleType | null;
  schedule_day?: ScheduleDayType | null;
  schedule_frame?: ScheduleFrameType | null;
  schedule_hour?: number | null;
  schedule_minute?: number | null;
}

export type ScheduleType = "hourly" | "daily" | "weekly" | "monthly";

export type ScheduleDayType =
  | "sun"
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat";

export type ScheduleFrameType = "first" | "mid" | "last";

export interface FontFile {
  src: string;
  fontWeight: number;
  fontFormat: FontFormat;
}

export type FontFormat = "woff" | "woff2" | "truetype";

export interface Version {
  tag?: string;
}

export interface VersionInfoRecord {
  version: string; // tag
  released?: string; // year-month-day
  patch?: boolean;
  highlights?: string[];
  announcement_url?: string;
}

export interface VersionInfo {
  latest?: VersionInfoRecord;
  older?: VersionInfoRecord[];
}

export type LocaleData = [string, string];

export type LoadingMessage =
  | "doing-science"
  | "running-query"
  | "loading-results";

export type TokenStatusStatus = "unpaid" | "past-due" | "invalid" | string;

export interface TokenStatus {
  status?: TokenStatusStatus;
  valid: boolean;
  "valid-thru"?: string;
  "error-details"?: string;
  trial: boolean;
}

export type DayOfWeekId =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export const tokenFeatures = [
  "advanced_permissions",
  "audit_app",
  "cache_granular_controls",
  "disable_password_login",
  "content_verification",
  "embedding",
  "hosting",
  "official_collections",
  "sandboxes",
  "sso_google",
  "sso_jwt",
  "sso_ldap",
  "sso_saml",
  "session_timeout_config",
  "whitelabel",
  "dashboard_subscription_filters",
  "snippet_collections",
  "email_allow_list",
  "email_restrict_recipients",
] as const;

export type TokenFeature = typeof tokenFeatures[number];
export type TokenFeatures = Record<TokenFeature, boolean>;

export type PasswordComplexity = {
  total?: number;
  digit?: number;
};

export type SessionCookieSameSite = "lax" | "strict" | "none";

export interface SettingDefinition {
  key: string;
  env_name?: string;
  is_env_setting: boolean;
  value?: unknown;
  default?: unknown;
}

export interface OpenAiModel {
  id: string;
  owned_by: string;
}

export type HelpLinkSetting = "metabase" | "hidden" | "custom";

export interface Settings {
  "active-users-count"?: number;
  "admin-email": string;
  "anon-tracking-enabled": boolean;
  "application-font": string;
  "application-font-files": FontFile[] | null;
  "application-name": string;
  "available-fonts": string[];
  "available-locales": LocaleData[] | null;
  "bcc-enabled?": boolean;
  "cloud-gateway-ips": string[] | null;
  "custom-formatting": FormattingSettings;
  "custom-homepage": boolean;
  "custom-homepage-dashboard": number | null;
  "deprecation-notice-version"?: string;
  "dismissed-custom-dashboard-toast"?: boolean;
  "email-configured?": boolean;
  "embedding-app-origin": string;
  "embedding-secret-key"?: string;
  "enable-embedding": boolean;
  "enable-enhancements?": boolean;
  "enable-nested-queries": boolean;
  "enable-query-caching"?: boolean;
  "query-caching-ttl-ratio": number;
  "query-caching-min-ttl": number;
  "enable-password-login": boolean;
  "enable-public-sharing": boolean;
  "enable-xrays": boolean;
  engines: Record<string, Engine>;
  "ga-enabled": boolean;
  "google-auth-auto-create-accounts-domain": string | null;
  "google-auth-client-id": string | null;
  "google-auth-configured": boolean;
  "google-auth-enabled": boolean;
  "has-user-setup": boolean;
  "hide-embed-branding?": boolean;
  "help-link": HelpLinkSetting;
  "help-link-custom-destination": string;
  "is-hosted?": boolean;
  "is-metabot-enabled": boolean;
  "jwt-enabled"?: boolean;
  "jwt-configured"?: boolean;
  "ldap-configured?": boolean;
  "ldap-enabled": boolean;
  "loading-message": LoadingMessage;
  "map-tile-server-url": string;
  "openai-api-key": string | null;
  "openai-organization": string | null;
  "openai-model": string | null;
  "openai-available-models"?: OpenAiModel[];
  "other-sso-enabled?": boolean | null;
  "password-complexity": PasswordComplexity;
  "persisted-models-enabled": boolean;
  "premium-embedding-token": string | null;
  "report-timezone-short": string;
  "report-timezone-long": string;
  "saml-configured"?: boolean;
  "saml-enabled"?: boolean;
  "search-typeahead-enabled": boolean;
  "setup-token": string | null;
  "session-cookies": boolean | null;
  "session-cookie-samesite": SessionCookieSameSite;
  "snowplow-enabled": boolean;
  "snowplow-url": string;
  "show-database-syncing-modal": boolean;
  "show-homepage-data": boolean;
  "show-homepage-pin-message": boolean;
  "show-homepage-xrays": boolean;
  "show-lighthouse-illustration": boolean;
  "show-metabot": boolean;
  "site-locale": string;
  "site-uuid": string;
  "site-url": string;
  "slack-app-token": string | null;
  "slack-files-channel": string | null;
  "slack-token": string | null;
  "slack-token-valid?": boolean;
  "start-of-week"?: DayOfWeekId;
  "subscription-allowed-domains": string | null;
  "token-features": TokenFeatures;
  "token-status": TokenStatus | null;
  "user-locale": string | null;
  version: Version;
  "version-info": VersionInfo | null;
  "version-info-last-checked": string | null;
  "uploads-enabled": boolean;
  "uploads-database-id": number | null;
  "uploads-schema-name": string | null;
  "uploads-table-prefix": string | null;
  "user-visibility": string | null;
  "last-acknowledged-version": string | null;
}

export type SettingKey = keyof Settings;

export type SettingValue = Settings[SettingKey];
