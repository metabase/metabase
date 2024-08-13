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
  "attached_dwh",
  "advanced_permissions",
  "audit_app",
  "cache_granular_controls",
  "disable_password_login",
  "content_verification",
  "embedding",
  "hosting",
  "llm_autodescription",
  "official_collections",
  "sandboxes",
  "scim",
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

export interface UploadsSettings {
  db_id: number | null;
  schema_name: string | null;
  table_prefix: string | null;
}

interface InstanceSettings {
  "admin-email": string;
  "email-smtp-host": string | null;
  "email-smtp-port": number | null;
  "email-smtp-security": "none" | "ssl" | "tls" | "starttls";
  "email-smtp-username": string | null;
  "email-smtp-password": string | null;
  "enable-embedding": boolean;
  "enable-nested-queries": boolean;
  "enable-public-sharing": boolean;
  "enable-xrays": boolean;
  "example-dashboard-id": number | null;
  "read-only-mode": boolean;
  "search-typeahead-enabled": boolean;
  "show-homepage-data": boolean;
  "show-homepage-pin-message": boolean;
  "show-homepage-xrays": boolean;
  "site-uuid": string;
  "subscription-allowed-domains": string | null;
  "uploads-settings": UploadsSettings;
  "user-visibility": string | null;
}

export type EmbeddingHomepageDismissReason =
  | "dismissed-done"
  | "dismissed-run-into-issues"
  | "dismissed-not-interested-now";
export type EmbeddingHomepageStatus =
  | EmbeddingHomepageDismissReason
  | "visible"
  | "hidden";

interface AdminSettings {
  "active-users-count"?: number;
  "deprecation-notice-version"?: string;
  "embedding-secret-key"?: string;
  "query-caching-min-ttl": number;
  "query-caching-ttl-ratio": number;
  "google-auth-auto-create-accounts-domain": string | null;
  "google-auth-configured": boolean;
  "jwt-configured"?: boolean;
  "jwt-enabled"?: boolean;
  "premium-embedding-token": string | null;
  "saml-configured"?: boolean;
  "saml-enabled"?: boolean;
  "show-database-syncing-modal": boolean;
  "token-status": TokenStatus | null;
  "version-info": VersionInfo | null;
  "last-acknowledged-version": string | null;
  "show-static-embed-terms": boolean | null;
  "embedding-homepage": EmbeddingHomepageStatus;
  "setup-embedding-autoenabled": boolean;
  "setup-license-active-at-setup": boolean;
  "store-url": string;
}

interface SettingsManagerSettings {
  "bcc-enabled?": boolean;
  "ee-openai-api-key"?: string;
  "openai-api-key": string | null;
  "openai-available-models"?: OpenAiModel[];
  "openai-model": string | null;
  "openai-organization": string | null;
  "session-cookie-samesite": SessionCookieSameSite;
  "slack-app-token": string | null;
  "slack-files-channel": string | null;
  "slack-token": string | null;
  "slack-token-valid?": boolean;
}

type PrivilegedSettings = AdminSettings & SettingsManagerSettings;

interface PublicSettings {
  "anon-tracking-enabled": boolean;
  "application-font": string;
  "application-font-files": FontFile[] | null;
  "application-name": string;
  "available-fonts": string[];
  "available-locales": LocaleData[] | null;
  "cloud-gateway-ips": string[] | null;
  "custom-formatting": FormattingSettings;
  "custom-homepage": boolean;
  "custom-homepage-dashboard": number | null;
  "ee-ai-features-enabled"?: boolean;
  "email-configured?": boolean;
  "embedding-app-origin": string;
  "enable-enhancements?": boolean;
  "enable-password-login": boolean;
  engines: Record<string, Engine>;
  "google-auth-client-id": string | null;
  "google-auth-enabled": boolean;
  "has-user-setup": boolean;
  "help-link": HelpLinkSetting;
  "help-link-custom-destination": string;
  "hide-embed-branding?": boolean;
  "is-hosted?": boolean;
  "is-metabot-enabled": boolean;
  "ldap-configured?": boolean;
  "ldap-enabled": boolean;
  "ldap-port": number;
  "ldap-group-membership-filter": string;
  "loading-message": LoadingMessage;
  "map-tile-server-url": string;
  "other-sso-enabled?": boolean | null; // TODO: FIXME! This is an enterprise-only setting!
  "password-complexity": PasswordComplexity;
  "persisted-models-enabled": boolean;
  "persisted-model-refresh-cron-schedule": string;
  "report-timezone-long": string;
  "report-timezone-short": string;
  "session-cookies": boolean | null;
  "setup-token": string | null;
  "show-metabase-links": boolean;
  "show-metabot": boolean;
  "site-locale": string;
  "site-url": string;
  "snowplow-enabled": boolean;
  "snowplow-url": string;
  "start-of-week": DayOfWeekId;
  "token-features": TokenFeatures;
  version: Version;
  "version-info-last-checked": string | null;
}

export type UserSettings = {
  "dismissed-browse-models-banner"?: boolean;
  "dismissed-custom-dashboard-toast"?: boolean;
  "last-used-native-database-id"?: number | null;
  "notebook-native-preview-shown"?: boolean;
  "notebook-native-preview-sidebar-width"?: number | null;
  "expand-browse-in-nav"?: boolean;
  "expand-bookmarks-in-nav"?: boolean;
  "browse-filter-only-verified-models"?: boolean;
  "show-updated-permission-modal": boolean;
  "show-updated-permission-banner": boolean;
};

export type Settings = InstanceSettings &
  PublicSettings &
  UserSettings &
  PrivilegedSettings;

export type SettingKey = keyof Settings;

export type SettingValue = Settings[SettingKey];
