import _ from "underscore";

import {
  AIToolKey,
  type McpAppsBootstrapResponse,
  type McpAppsBootstrapUser,
  type MetabotConversation,
  type MetabotGroupPermission,
  type MetabotInfo,
  type UserMetabotPermissions,
  type UserMetabotPermissionsResponse,
} from "../metabot";
import type { EnterpriseSettingKey, EnterpriseSettings } from "../settings";

import { createMockSettings } from "./settings";

export const createMockMetabotInfo = (
  opts?: Partial<MetabotInfo>,
): MetabotInfo => ({
  id: 1,
  name: "Metabot",
  entity_id: "metabot",
  description: "",
  use_verified_content: false,
  collection_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
});

export const createMockMetabotConversation = (
  opts?: Partial<MetabotConversation>,
): MetabotConversation => ({
  conversation_id: "00000000-0000-0000-0000-000000000000",
  created_at: new Date().toISOString(),
  title: null,
  user_id: 1,
  profile_id: null,
  message_count: 1,
  last_message_at: new Date().toISOString(),
  forked_from_conversation_id: null,
  ...opts,
});

export const createMockUserMetabotPermissions = (
  opts?: Partial<UserMetabotPermissions>,
): UserMetabotPermissionsResponse => ({
  permissions: {
    metabot: "yes",
    "metabot-sql-generation": "yes",
    "metabot-nlq": "yes",
    "metabot-other-tools": "yes",
    ...opts,
  },
});

export const createMockMetabotGroupPermission = (
  opts?: Partial<MetabotGroupPermission>,
): MetabotGroupPermission => ({
  group_id: 1,
  perm_type: AIToolKey.Metabot,
  perm_value: "yes",
  ...opts,
});

export const createMockMetabotGroupPermissions = (
  groupId: number,
  overrides?: Partial<Record<AIToolKey, "yes" | "no">>,
): MetabotGroupPermission[] => {
  const defaults: Record<AIToolKey, "yes" | "no"> = {
    [AIToolKey.Metabot]: "yes",
    [AIToolKey.ChatAndNLQ]: "yes",
    [AIToolKey.SQLGeneration]: "yes",
    [AIToolKey.OtherTools]: "yes",
    ...overrides,
  };

  return Object.entries(defaults).map(([permType, permValue]) => ({
    group_id: groupId,
    // Unjustified type cast. FIXME
    perm_type: permType as AIToolKey,
    perm_value: permValue,
  }));
};

/**
 * The setting keys `GET /api/embed-mcp/bootstrap` returns, out of those
 * {@link createMockSettings} defines: the `:public`, `:authenticated` and
 * `:admin-write-authed-read` settings a non-admin authenticated user may read.
 * Everything else — SMTP and SSO configuration, LLM keys, Slack tokens — is
 * `:admin`, `:internal` or `:settings-manager`, and the endpoint drops it.
 */
export const MCP_APPS_BOOTSTRAP_SETTING_KEYS = [
  "admin-email",
  "agent-api-enabled?",
  "ai-features-enabled?",
  "airgap-enabled",
  "allowed-iframe-hosts",
  "analytics-uuid",
  "anon-tracking-enabled",
  "application-colors",
  "application-favicon-url",
  "application-font",
  "application-font-files",
  "application-name",
  "available-fonts",
  "available-locales",
  "available-timezones",
  "bug-reporting-enabled",
  "cloud-gateway-ips",
  "csp-img-allowed-hosts",
  "csp-img-enabled",
  "custom-formatting",
  "custom-geojson",
  "custom-homepage",
  "custom-homepage-dashboard",
  "custom-viz-plugin-dev-mode-enabled",
  "development-mode?",
  "email-configured?",
  "embedded-metabot-enabled?",
  "embedding-app-origin",
  "embedding-app-origins-interactive",
  "embedding-app-origins-sdk",
  "enable-embedding",
  "enable-embedding-interactive",
  "enable-embedding-sdk",
  "enable-embedding-simple",
  "enable-embedding-static",
  "enable-nested-queries",
  "enable-password-login",
  "enable-pivoted-exports",
  "enable-public-sharing",
  "enable-sandboxes?",
  "enable-xrays",
  "example-dashboard-id",
  "expand-bookmarks-in-nav",
  "expand-browse-in-nav",
  "google-auth-client-id",
  "google-auth-enabled",
  "has-sample-database?",
  "has-user-setup",
  "help-link",
  "help-link-custom-destination",
  "hide-embed-branding?",
  "instance-creation",
  "is-hosted?",
  "last-used-native-database-id",
  "ldap-configured?",
  "ldap-enabled",
  "llm-anthropic-api-key-configured?",
  "loading-message",
  "map-tile-server-url",
  "mcp-enabled?",
  "metabot-enabled?",
  "metabot-icon",
  "metabot-name",
  "metabot-show-illustrations",
  "metaplow-tracking-enabled",
  "metaplow-url",
  "mfa-enforcement",
  "native-query-autocomplete-match-style",
  "non-table-chart-generated",
  "notebook-native-preview-sidebar-width",
  "oidc-login-providers",
  "other-sso-enabled?",
  "password-complexity",
  "persisted-models-enabled",
  "read-only-mode",
  "redirect-all-requests-to-https",
  "report-timezone-long",
  "report-timezone-short",
  "sdk-iframe-embed-setup-settings",
  "search-engine",
  "search-typeahead-enabled",
  "session-cookies",
  "setup-token",
  "show-google-sheets-integration",
  "show-homepage-data",
  "show-homepage-pin-message",
  "show-homepage-xrays",
  "show-metabase-links",
  "show-metabot",
  "site-locale",
  "site-url",
  "site-uuid",
  "snowplow-enabled",
  "snowplow-url",
  "start-of-week",
  "token-features",
  "tracing-enabled",
  "transforms-enabled",
  "transforms-meter-locked",
  "transforms-setup-complete",
  "trial-banner-dismissal-timestamp",
  "uploads-settings",
  "use-tenants",
  "user-visibility",
  "version-info-last-checked",
] as const satisfies readonly EnterpriseSettingKey[];

export const createMockMcpAppsBootstrapUser = (
  opts?: Partial<McpAppsBootstrapUser>,
): McpAppsBootstrapUser => ({
  id: 1,
  locale: null,
  is_superuser: false,
  is_data_analyst: false,
  is_qbnewb: false,
  tenant_id: null,
  personal_collection_id: 1,
  permissions: {
    can_create_queries: true,
    can_create_native_queries: true,
  },
  ...opts,
});

export const createMockMcpAppsBootstrapSettings = (
  opts?: Partial<EnterpriseSettings>,
): EnterpriseSettings => {
  const projected = _.pick(
    createMockSettings(opts),
    ...MCP_APPS_BOOTSTRAP_SETTING_KEYS,
  );

  // The endpoint answers a visibility-filtered subset while the client types the
  // payload as the whole `EnterpriseSettings`. Reproducing that gap is the point of
  // this fixture: a component that reads a setting the projection drops has to fail
  // here rather than read a value only the mock provides.
  return projected as EnterpriseSettings;
};

export const createMockMcpAppsBootstrapResponse = (
  opts?: Partial<McpAppsBootstrapResponse>,
): McpAppsBootstrapResponse => ({
  user: createMockMcpAppsBootstrapUser(),
  settings: createMockMcpAppsBootstrapSettings(),
  ...opts,
});
