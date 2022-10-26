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
  "available-locales": [],
  "enable-public-sharing": false,
  "enable-xrays": false,
  "email-configured?": false,
  engines: createMockEngines(),
  "is-hosted?": false,
  "google-auth-client-id": null,
  "ldap-enabled": false,
  "loading-message": "doing-science",
  "deprecation-notice-version": undefined,
  "session-cookies": null,
  "site-locale": "en",
  "show-database-syncing-modal": false,
  "show-homepage-data": false,
  "show-homepage-xrays": false,
  "show-homepage-pin-message": false,
  "show-lighthouse-illustration": true,
  "show-metabot": true,
  "slack-token": undefined,
  "token-status": createMockTokenStatus(),
  "slack-token-valid?": false,
  "slack-app-token": undefined,
  "slack-files-channel": undefined,
  version: createMockVersion(),
  ...opts,
});
