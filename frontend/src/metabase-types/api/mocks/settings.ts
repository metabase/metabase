import type {
  Engine,
  EngineField,
  EngineSource,
  FontFile,
  SettingDefinition,
  Settings,
  TokenFeatures,
  TokenStatus,
  Version,
  VersionInfo,
  VersionInfoRecord,
} from "metabase-types/api";

export const createMockEngine = (opts?: Partial<Engine>): Engine => ({
  "driver-name": "PostgreSQL",
  "details-fields": [],
  source: createMockEngineSource(),
  "superseded-by": null,
  ...opts,
});

export const createMockEngineField = (
  opts?: Partial<EngineField>,
): EngineField => ({
  name: "field",
  "display-name": "Field",
  ...opts,
});

export const createMockEngineSource = (
  opts?: Partial<EngineSource>,
): EngineSource => ({
  type: "official",
  contact: null,
  ...opts,
});

export const createMockEngines = (
  opts?: Record<string, Engine>,
): Record<string, Engine> => ({
  postgres: createMockEngine(),
  communityEngine: createMockEngine({
    "driver-name": "CommunityEngine",
    source: createMockEngineSource({
      type: "community",
    }),
  }),
  partnerEngine: createMockEngine({
    "driver-name": "PartnerEngine",
    source: createMockEngineSource({
      type: "partner",
    }),
  }),
  ...opts,
});

export const createMockFontFile = (opts?: Partial<FontFile>): FontFile => ({
  src: "https://metabase.test/regular.woff2",
  fontWeight: 400,
  fontFormat: "woff2",
  ...opts,
});

export const createMockVersion = (opts?: Partial<Version>): Version => ({
  tag: "v1",
  ...opts,
});

export const createMockVersionInfoRecord = (
  opts?: Partial<VersionInfoRecord>,
): VersionInfoRecord => ({
  version: "v1",
  released: "2021-01-01",
  patch: true,
  highlights: ["Bug fix"],
  ...opts,
});

export const createMockVersionInfo = (
  opts?: Partial<VersionInfo>,
): VersionInfo => ({
  latest: createMockVersionInfoRecord(),
  older: [createMockVersionInfoRecord()],
  ...opts,
});

export const createMockTokenStatus = (
  opts?: Partial<TokenStatus>,
): TokenStatus => ({
  status: "Token is Valid.",
  valid: true,
  trial: false,
  "valid-thru": "2022-12-30T23:00:00Z",
  ...opts,
});

export const createMockTokenFeatures = (
  opts?: Partial<TokenFeatures>,
): TokenFeatures => ({
  advanced_permissions: false,
  audit_app: false,
  cache_granular_controls: false,
  disable_password_login: false,
  content_verification: false,
  embedding: false,
  hosting: false,
  official_collections: false,
  sandboxes: false,
  sso_google: false,
  sso_jwt: false,
  sso_ldap: false,
  sso_saml: false,
  session_timeout_config: false,
  whitelabel: false,
  dashboard_subscription_filters: false,
  snippet_collections: false,
  email_allow_list: false,
  email_restrict_recipients: false,
  ...opts,
});

export const createMockSettingDefinition = (
  opts?: Partial<SettingDefinition>,
): SettingDefinition => ({
  key: "key",
  env_name: "",
  is_env_setting: false,
  value: null,
  ...opts,
});

export const createMockSettings = (opts?: Partial<Settings>): Settings => ({
  "admin-email": "admin@metabase.test",
  "anon-tracking-enabled": false,
  "application-font": "Lato",
  "application-font-files": [],
  "application-name": "Metabase",
  "available-fonts": [],
  "available-locales": null,
  "bcc-enabled?": true,
  "cloud-gateway-ips": null,
  "custom-formatting": {},
  "custom-homepage": false,
  "custom-homepage-dashboard": null,
  "help-link": "metabase",
  "help-link-custom-destination": "",
  "deprecation-notice-version": undefined,
  "email-configured?": false,
  "embedding-app-origin": "",
  "enable-embedding": false,
  "enable-enhancements?": false,
  "enable-nested-queries": true,
  "enable-query-caching": undefined,
  "query-caching-ttl-ratio": 10,
  "query-caching-min-ttl": 60,
  "enable-password-login": true,
  "enable-public-sharing": false,
  "enable-xrays": false,
  engines: createMockEngines(),
  "has-user-setup": true,
  "hide-embed-branding?": true,
  "ga-enabled": false,
  "google-auth-auto-create-accounts-domain": null,
  "google-auth-client-id": null,
  "google-auth-configured": false,
  "google-auth-enabled": false,
  "is-hosted?": false,
  "is-metabot-enabled": false,
  "jwt-enabled": false,
  "jwt-configured": false,
  "ldap-configured?": false,
  "ldap-enabled": false,
  "loading-message": "doing-science",
  "map-tile-server-url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "openai-api-key": null,
  "openai-organization": null,
  "openai-model": null,
  "openai-available-models": [],
  "other-sso-enabled?": null,
  "password-complexity": { total: 6, digit: 1 },
  "persisted-models-enabled": false,
  "premium-embedding-token": null,
  "report-timezone-short": "UTC",
  "report-timezone-long": "Europe/London",
  "saml-configured": false,
  "saml-enabled": false,
  "snowplow-url": "",
  "search-typeahead-enabled": true,
  "setup-token": null,
  "session-cookies": null,
  "session-cookie-samesite": "lax",
  "snowplow-enabled": false,
  "show-database-syncing-modal": false,
  "show-homepage-data": false,
  "show-homepage-pin-message": false,
  "show-homepage-xrays": false,
  "show-lighthouse-illustration": true,
  "show-metabot": true,
  "site-locale": "en",
  "site-url": "http://localhost:3000",
  "site-uuid": "1234",
  "slack-app-token": null,
  "slack-files-channel": null,
  "slack-token": null,
  "slack-token-valid?": false,
  "subscription-allowed-domains": null,
  "token-features": createMockTokenFeatures(),
  "token-status": null,
  "user-locale": null,
  version: createMockVersion(),
  "version-info": createMockVersionInfo(),
  "version-info-last-checked": null,
  "uploads-enabled": false,
  "uploads-database-id": null,
  "uploads-table-prefix": null,
  "uploads-schema-name": null,
  "user-visibility": null,
  "last-acknowledged-version": "v1",
  ...opts,
});
