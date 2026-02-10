import type { ReactNode } from "react";

import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { CurrencyStyle } from "metabase/lib/formatting";

import type { InputSettingType } from "./actions";
import type { DashboardId } from "./dashboard";
import type { DatabaseId } from "./database";
import type { GroupId } from "./group";
import type { UserId } from "./user";

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
  currency_style?: CurrencyStyle;
  currency_in_header?: boolean;
}

export const engineKeys = [
  "athena",
  "bigquery-cloud-sdk",
  "clickhouse",
  "databricks",
  "druid-jdbc",
  "druid",
  "mongo",
  "mysql",
  "oracle",
  "postgres",
  "presto-jdbc",
  "redshift",
  "snowflake",
  "sparksql",
  "sqlite",
  "sqlserver",
  "starburst",
  "vertica",
] as const;

export const providerNames = [
  "Aiven",
  "Amazon RDS",
  "Azure",
  "Crunchy Data",
  "DigitalOcean",
  "Fly.io",
  "Neon",
  "PlanetScale",
  "Railway",
  "Render",
  "Scaleway",
  "Supabase",
  "Timescale",
] as const;

export type DatabaseProviderName = (typeof providerNames)[number];

export type DatabaseProvider = {
  name: DatabaseProviderName;
  pattern: string;
};

export type EngineKey = (typeof engineKeys)[number];

export type ContainerStyleType = "grid" | "component";
export type ContainerStyle = [ContainerStyleType, string];

export function isContainerStyle(value: unknown): value is ContainerStyle {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (value[0] === "grid" || value[0] === "component") &&
    typeof value[1] === "string"
  );
}

export interface DatabaseFieldGroup {
  type: "group";
  "container-style": unknown;
  fields: EngineField[];
}

export type DatabaseFieldOrGroup = EngineField | DatabaseFieldGroup;

export interface Engine {
  "driver-name": string;
  "details-fields"?: DatabaseFieldOrGroup[];
  source: EngineSource;
  "superseded-by": string | null;
  "extra-info": {
    "db-routing-info": {
      text: string;
    };
    providers?: DatabaseProvider[];
  } | null;
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
  | "section"
  | "hidden";

export type EngineFieldTreatType = "base64";

export interface EngineFieldOption {
  name: string;
  value: string;
}

export interface EngineSource {
  type: "official" | "community";
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

export type ScheduleType =
  | "every_n_minutes"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  // 'cron' type implies usage of more complex expressions represented
  // by raw cron string.
  | "cron";

export type ScheduleDayType =
  | "sun"
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat";

export type ScheduleFrameType = "first" | "mid" | "last";

export type ScheduleDisplayType = "cron/builder" | "cron/raw" | null;

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
  nightly?: VersionInfoRecord;
  beta?: VersionInfoRecord;
  latest?: VersionInfoRecord;
  older?: VersionInfoRecord[];
}

export type LocaleData = [string, string];

export type LoadingMessage =
  | "doing-science"
  | "running-query"
  | "loading-results";

export type TokenStatusStatus = "unpaid" | "past-due" | "invalid" | string;

export type GdrivePayload = {
  status: "not-connected" | "syncing" | "active" | "paused" | "error";
  url?: string;
  message?: string; // only for errors
  created_at?: number;
  created_by_id?: UserId;
  sync_started_at?: number;
  last_sync_at?: number;
  next_sync_at?: number;
  error_message?: string;
  db_id?: number;
  error?: string;
};

/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for types */
const tokenStatusFeatures = [
  "advanced-config",
  "advanced-permissions",
  "audit-app",
  "cache-granular-controls",
  "collection-cleanup",
  "config-text-file",
  "content-management",
  "content-translation",
  "content-verification",
  "dashboard-subscription-filters",
  "database-auth-providers",
  "disable-password-login",
  "email-allow-list",
  "email-restrict-recipients",
  "embedding-sdk",
  "embedding",
  "embedding-simple",
  "embedding-hub",
  "hosting",
  "metabase-store-managed",
  "metabot-v3",
  "no-upsell",
  "official-collections",
  "query-reference-validation",
  "question-error-logs",
  "refresh-token-features",
  "sandboxes",
  "scim",
  "serialization",
  "session-timeout-config",
  "snippet-collections",
  "sso-google",
  "sso-jwt",
  "sso-ldap",
  "sso-saml",
  "sso",
  "transforms",
  "transforms-python",
  "upload-management",
  "whitelabel",
] as const;

export type TokenStatusFeature = (typeof tokenStatusFeatures)[number];

export const REMOTE_SYNC_TYPES = ["read-only", "read-write"] as const;
export type RemoteSyncType = (typeof REMOTE_SYNC_TYPES)[number];

interface TokenStatusStoreUsers {
  email: string;
}

export interface TokenStatus {
  status: TokenStatusStatus;
  valid: boolean;
  "valid-thru"?: string;
  "error-details"?: string;
  trial?: boolean;
  features?: TokenStatusFeature[];
  "store-users"?: TokenStatusStoreUsers[];
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
  "cloud_custom_smtp",
  "content_translation",
  "content_verification",
  "disable_password_login",
  "embedding",
  "embedding_sdk",
  "embedding_simple",
  "hosting",
  "official_collections",
  "sandboxes",
  "scim",
  "sso_google",
  "sso_jwt",
  "sso_ldap",
  "sso_saml",
  "session_timeout_config",
  "whitelabel",
  "serialization",
  "dashboard_subscription_filters",
  "snippet_collections",
  "email_allow_list",
  "email_restrict_recipients",
  "upload_management",
  "collection_cleanup",
  "cache_preemptive",
  "metabot_v3",
  "ai_sql_fixer",
  "ai_sql_generation",
  "ai_entity_analysis",
  "database_routing",
  "development_mode",
  "etl_connections",
  "etl_connections_pg",
  "table_data_editing",
  "remote_sync",
  "dependencies",
  "semantic_search",
  "transforms",
  "transforms-python",
  "library",
  "support-users",
  "tenants",
  "workspaces",
] as const;

export type TokenFeature = (typeof tokenFeatures)[number];
export type TokenFeatures = Record<TokenFeature, boolean>;

export type PasswordComplexity = {
  total?: number;
  digit?: number;
};

export type SessionCookieSameSite = "lax" | "strict" | "none";

export interface SettingDefinition<
  Key extends EnterpriseSettingKey = EnterpriseSettingKey,
> {
  key: Key;
  env_name?: string;
  is_env_setting?: boolean;
  value?: EnterpriseSettingValue<Key>;
  default?: EnterpriseSettingValue<Key>;
  display_name?: string;
  description?: string | ReactNode | null;
  type?: InputSettingType;
}

export type SettingDefinitionMap<
  T extends EnterpriseSettingKey = EnterpriseSettingKey,
> = {
  [K in T]: SettingDefinition<K>;
};

export interface OpenAiModel {
  id: string;
  owned_by: string;
}

export type HelpLinkSetting = "metabase" | "hidden" | "custom";

export type AutocompleteMatchStyle = "off" | "prefix" | "substring";

export interface UploadsSettings {
  db_id: number | null;
  schema_name: string | null;
  table_prefix: string | null;
}

export type CustomGeoJSONMap = {
  name: string;
  url: string;
  region_key: string;
  region_name: string;
  builtin?: boolean;
};

export type CustomGeoJSONSetting = Record<string, CustomGeoJSONMap>;

interface InstanceSettings {
  "admin-email": string | null;
  "email-from-address-override": string | null;
  "email-smtp-host-override": string | null;
  "email-smtp-port-override": 465 | 587 | 2525 | null;
  "email-smtp-security-override": "ssl" | "tls" | "starttls" | null;
  "email-smtp-username-override": string | null;
  "email-smtp-password-override": string | null;
  "email-from-name": string | null;
  "email-from-address": string | null;
  "email-reply-to": string[] | null;
  "email-smtp-host": string | null;
  "email-smtp-port": number | null;
  "email-smtp-security": "none" | "ssl" | "tls" | "starttls" | null;
  "email-smtp-username": string | null;
  "email-smtp-password": string | null;
  "enable-embedding": boolean;
  "enable-embedding-static": boolean;
  "enable-embedding-sdk": boolean;
  "enable-embedding-simple": boolean;
  "enable-embedding-interactive": boolean;
  "enable-nested-queries": boolean;
  "enable-public-sharing": boolean;
  "enable-xrays": boolean;
  "example-dashboard-id": number | null;
  "has-sample-database?"?: boolean; // Careful! This can be undefined during setup!
  "instance-creation": string;
  "llm-sql-generation-enabled": boolean;
  "read-only-mode": boolean;
  "search-typeahead-enabled": boolean;
  "show-homepage-data": boolean;
  "show-homepage-pin-message": boolean;
  "show-homepage-xrays": boolean;
  "site-name": string;
  "site-uuid": string;
  "smtp-override-enabled": boolean;
  "subscription-allowed-domains": string | null;
  "uploads-settings": UploadsSettings;
  "user-visibility": string | null;
  "query-analysis-enabled": boolean;
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
  "custom-geojson-enabled": boolean;
  "deprecation-notice-version"?: string;
  "disable-cors-on-localhost": boolean;
  "embedding-secret-key"?: string;
  "redirect-all-requests-to-https": boolean;
  "query-caching-min-ttl": number;
  "query-caching-ttl-ratio": number;
  "google-auth-auto-create-accounts-domain": string | null;
  "google-auth-configured": boolean;
  "premium-embedding-token": string | null;
  "other-sso-enabled?"?: boolean; // yes the question mark is in the variable name
  "show-database-syncing-modal": boolean;
  "token-status": TokenStatus | null;
  "version-info"?: VersionInfo | null;
  "last-acknowledged-version": string | null;
  "show-static-embed-terms": boolean | null;
  "show-sdk-embed-terms": boolean | null;
  "show-simple-embed-terms": boolean | null;
  "system-timezone"?: string;
  "embedding-homepage": EmbeddingHomepageStatus;
  "setup-license-active-at-setup": boolean;
  "embedding-hub-test-embed-snippet-created": boolean;
  "embedding-hub-production-embed-snippet-created": boolean;
  "store-url": string;
  gsheets: Partial<GdrivePayload>;
  "license-token-missing-banner-dismissal-timestamp"?: Array<string>;
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
  "slack-bug-report-channel": string | null;
  "slack-token": string | null;
  "slack-token-valid?": boolean;
}

type PrivilegedSettings = AdminSettings & SettingsManagerSettings;

interface PublicSettings {
  "allowed-iframe-hosts": string;
  "analytics-uuid": string;
  "anon-tracking-enabled": boolean;
  "application-font": string;
  "application-font-files": FontFile[] | null;
  "application-name": string;
  "application-favicon-url": string;
  "available-fonts": string[];
  "available-locales": LocaleData[] | null;
  "available-timezones": string[] | null;
  "bug-reporting-enabled": boolean;
  "check-for-updates": boolean;
  "cloud-gateway-ips": string[] | null;
  "custom-formatting": FormattingSettings;
  "custom-geojson": CustomGeoJSONSetting;
  "custom-homepage": boolean;
  "custom-homepage-dashboard": DashboardId | null;
  "development-mode?": boolean;
  "ee-ai-features-enabled"?: boolean;
  "email-configured?": boolean;
  "embedding-app-origin": string | null;
  "embedding-app-origins-sdk": string | null;
  "embedding-app-origins-interactive": string | null;
  "enable-password-login": boolean;
  "enable-pivoted-exports": boolean;
  "enable-sandboxes?": boolean;
  engines: Record<EngineKey, Engine>;
  "google-auth-client-id": string | null;
  "google-auth-enabled": boolean;
  "has-user-setup": boolean;
  "help-link": HelpLinkSetting;
  "help-link-custom-destination": string;
  "humanization-strategy": "simple" | "none";
  "hide-embed-branding?": boolean;
  "is-hosted?": boolean;
  "jwt-identity-provider-uri"?: string | null;
  "ldap-configured?": boolean;
  "ldap-enabled": boolean;
  "ldap-host": string | null;
  "ldap-port": number;
  "ldap-security": "none" | "ssl" | "starttls" | null;
  "ldap-bind-dn": string | null;
  "ldap-password": string | null;
  "ldap-user-base": string | null;
  "ldap-user-filter": string | null;
  "ldap-attribute-email": string | null;
  "ldap-attribute-firstname": string | null;
  "ldap-attribute-lastname": string | null;
  "ldap-group-sync": boolean;
  "ldap-group-base": string | null;
  "ldap-group-mappings": Record<string /*ldap group name */, GroupId[]> | null;
  "ldap-group-membership-filter"?: string;
  "ldap-user-provisioning-enabled?": boolean;
  "loading-message": LoadingMessage;
  "map-tile-server-url": string;
  "native-query-autocomplete-match-style": AutocompleteMatchStyle;
  "other-sso-enabled?": boolean | null; // TODO: FIXME! This is an enterprise-only setting!
  "password-complexity": PasswordComplexity;
  "persisted-models-enabled": boolean;
  "persisted-model-refresh-cron-schedule": string;
  "report-timezone": string | null;
  "report-timezone-long": string;
  "report-timezone-short": string;
  "session-cookies": boolean | null;
  "setup-token": string | null;
  "show-metabase-links": boolean;
  "show-metabot": boolean;
  "show-google-sheets-integration": boolean;
  "site-locale": string;
  "site-url": string;
  "snowplow-enabled": boolean;
  "snowplow-url": string;
  "start-of-week": DayOfWeekId;
  "token-features": TokenFeatures;
  "transforms-enabled": boolean;
  version: Version;
  "version-info-last-checked": string | null;
  "airgap-enabled": boolean;
  "non-table-chart-generated": boolean;
  "use-tenants": boolean;
}

export type UserSettings = {
  "dismissed-excel-pivot-exports-banner"?: boolean;
  "dismissed-collection-cleanup-banner"?: boolean;
  "dismissed-browse-models-banner"?: boolean;
  "dismissed-custom-dashboard-toast"?: boolean;
  "last-used-native-database-id"?: number | null;
  "notebook-native-preview-sidebar-width"?: number | null;
  "expand-browse-in-nav"?: boolean;
  "expand-bookmarks-in-nav"?: boolean;
  "expand-collections-in-nav"?: boolean;
  "expand-library-in-nav"?: boolean;
  "browse-filter-only-verified-models"?: boolean;
  "browse-filter-only-verified-metrics"?: boolean;
  "show-updated-permission-modal": boolean;
  "show-updated-permission-banner": boolean;
  "trial-banner-dismissal-timestamp"?: string | null;
  "sdk-iframe-embed-setup-settings"?: Pick<
    SdkIframeEmbedSetupSettings,
    "theme" | "useExistingUserSession"
  > | null;
  "color-scheme"?: string;
};

/**
 * Important distinction between `null` and `undefined` settings values.
 *  - `null` means that the setting actually has a value of `null`.
 *  - `undefined` means that the setting is not available in a certain context.
 *
 * Further longer explanation:
 *
 * Clojure doesn't have `undefined`. It uses `nil` to set (the default) value to (JS) `null`.
 * This can backfire on frontend if we are not aware of this distinction!
 *
 * Do not use `undefined` when checking for a setting value! Use `null` instead.
 * Use `undefined` only when checking does the setting (key) exist in a certain context.
 *
 * Contexts / Scopes:
 * Settings types are divided into contexts to make this more explicit:
 *  - `PublicSettings` will always be available to everyone.
 *  - `InstanceSettings` are settings that are available to all **authenticated** users.
 *  - `AdminSettings` are settings that are available only to **admins**.
 *  - `SettingsManagerSettings` are settings that are available only to **settings managers**.
 *  - `UserSettings` are settings that are available only to **regular users**.
 *
 * Each new scope is more strict than the previous one.
 *
 * To further complicate things, there are two endpoints for fetching settings:
 *  - `GET /api/setting` that _can only be used by admins!_
 *  - `GET /api/session/properties` that can be used by any user, but some settings might be omitted (unavailable).
 *
 * SettingsApi will return `403` for non-admins, while SessionApi will return `200`!
 */
export type Settings = InstanceSettings &
  PublicSettings &
  UserSettings &
  PrivilegedSettings;

export type SettingKey = keyof Settings;

export type SettingValue<Key extends SettingKey = SettingKey> = Settings[Key];

export type ColorSettings = Record<string, string>;

export type IllustrationSettingValue = "default" | "none" | "custom";
export type TimeoutValue = { amount: number; unit: string };

export type SearchEngineSettingValue = "semantic" | "appdb" | "in-place";

export type DatabaseReplicationConnections = Record<
  DatabaseId,
  { connection_id: string }
>;

export type SyncableEntity =
  | "transform"
  | "snippet"
  | "dataset"
  | "metric"
  | "segment"
  | "dashboard"
  | "question";

export interface EnterpriseSettings extends Settings {
  "application-colors"?: ColorSettings | null;
  "application-logo-url"?: string;
  "remote-sync-enabled"?: boolean | null;
  "remote-sync-token"?: string | null;
  "remote-sync-url"?: string | null;
  "remote-sync-branch"?: string | null;
  "remote-sync-type"?: RemoteSyncType | null;
  "remote-sync-auto-import"?: boolean | null;
  "remote-sync-transforms"?: boolean | null;
  "login-page-illustration"?: IllustrationSettingValue;
  "login-page-illustration-custom"?: string;
  "landing-page-illustration"?: IllustrationSettingValue;
  "landing-page-illustration-custom"?: string;
  "no-data-illustration"?: IllustrationSettingValue;
  "no-data-illustration-custom"?: string;
  "no-object-illustration"?: IllustrationSettingValue;
  "no-object-illustration-custom"?: string;
  "landing-page"?: string;
  "ee-ai-features-enabled"?: boolean;
  "ee-openai-api-key"?: string;
  "ee-openai-model"?: string;
  "session-timeout": TimeoutValue | null;
  "search-engine": SearchEngineSettingValue | null;
  "scim-enabled"?: boolean | null;
  "scim-base-url"?: string;
  "send-new-sso-user-admin-email?"?: boolean;
  "jwt-configured"?: boolean;
  "jwt-enabled"?: boolean;
  "jwt-enabled-and-configured"?: boolean;
  "jwt-user-provisioning-enabled?": boolean;
  "jwt-identity-provider-uri": string | null;
  "jwt-shared-secret": string | null;
  "jwt-attribute-email": string | null;
  "jwt-attribute-firstname": string | null;
  "jwt-attribute-lastname": string | null;
  "jwt-attribute-groups": string | null;
  "jwt-attribute-tenant": string | null;
  "jwt-group-sync": boolean | null;
  "saml-enabled": boolean;
  "saml-configured": boolean;
  "saml-user-provisioning-enabled?": boolean;
  "saml-identity-provider-uri": string | null;
  "saml-identity-provider-issuer": string | null;
  "saml-identity-provider-certificate": string | null;
  "saml-application-name": string | null;
  "saml-keystore-path": string | null;
  "saml-keystore-password": string | null;
  "saml-keystore-alias": string | null;
  "saml-attribute-email": string | null;
  "saml-attribute-firstname": string | null;
  "saml-attribute-lastname": string | null;
  "saml-attribute-tenant": string | null;
  "saml-attribute-group": string | null;
  "saml-group-sync": boolean | null;
  "saml-group-mappings": Record<string, GroupId[]> | null;
  "database-replication-enabled": boolean | null;
  "database-replication-connections"?: DatabaseReplicationConnections | null;
  "embedding-hub-test-embed-snippet-created": boolean;
  "embedding-hub-production-embed-snippet-created": boolean;
  "python-runner-url"?: string | null;
  "python-runner-api-token"?: string | null;
  "python-storage-s-3-endpoint"?: string | null;
  "python-storage-s-3-region"?: string | null;
  "python-storage-s-3-bucket"?: string | null;
  "python-storage-s-3-prefix"?: string | null;
  "python-storage-s-3-access-key"?: string | null;
  "python-storage-s-3-secret-key"?: string | null;
  "python-storage-s-3-container-endpoint"?: string | null;
  "python-storage-s-3-path-style-access"?: boolean | null;
  "python-runner-timeout-seconds"?: number | null;
  "python-runner-test-run-timeout-seconds"?: number | null;
  "llm-anthropic-api-key"?: string | null;
  "llm-anthropic-model": string;
  /**
   * @deprecated
   */
  application_logo_url?: string;
}

export type EnterpriseSettingKey = keyof EnterpriseSettings;
export type EnterpriseSettingValue<
  Key extends EnterpriseSettingKey = EnterpriseSettingKey,
> = EnterpriseSettings[Key];
