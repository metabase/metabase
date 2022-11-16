import { Engine, FontFile, Settings, Version } from "metabase-types/api";

export const createMockEngine = (opts?: Partial<Engine>): Engine => ({
  "driver-name": "PostgreSQL",
  "superseded-by": undefined,
  source: {
    type: "official",
  },
  ...opts,
});

export const createMockEngines = (
  opts?: Record<string, Engine>,
): Record<string, Engine> => ({
  postgres: createMockEngine(),
  communityEngine: createMockEngine({
    "driver-name": "CommunityEngine",
    source: {
      type: "community",
    },
  }),
  partnerEngine: createMockEngine({
    "driver-name": "PartnerEngine",
    source: {
      type: "partner",
    },
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

export const createMockTokenStatus = () => ({
  status: "Token is Valid.",
  valid: true,
  trial: false,
  features: [
    "audit-app",
    "advanced-permissions",
    "embedding",
    "whitelabel",
    "no-upsell",
    "advanced-config",
    "content-management",
    "sso",
    "sandboxes",
  ],
  "valid-thru": "2022-12-30T23:00:00Z",
});

export const createMockSettings = (opts?: Partial<Settings>): Settings => ({
  "application-font": "Lato",
  "application-font-files": [],
  "available-fonts": [],
  "available-locales": null,
  "custom-formatting": {},
  "deprecation-notice-version": undefined,
  "email-configured?": false,
  "enable-public-sharing": false,
  "enable-xrays": false,
  "google-auth-auto-create-accounts-domain": null,
  "google-auth-client-id": null,
  "google-auth-configured": false,
  "google-auth-enabled": false,
  "is-hosted?": false,
  "jwt-enabled": false,
  "jwt-configured": false,
  "ldap-configured?": false,
  "ldap-enabled": false,
  "loading-message": "doing-science",
  "saml-configured": false,
  "saml-enabled": false,
  "session-cookies": null,
  "show-database-syncing-modal": false,
  "show-homepage-data": false,
  "show-homepage-pin-message": false,
  "show-homepage-xrays": false,
  "show-lighthouse-illustration": true,
  "show-metabot": true,
  "site-locale": "en",
  "slack-app-token": null,
  "slack-files-channel": null,
  "slack-token": null,
  "slack-token-valid?": false,
  "token-status": createMockTokenStatus(),
  engines: createMockEngines(),
  version: createMockVersion(),
  ...opts,
});
