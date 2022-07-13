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

export const createMockSettings = (opts?: Partial<Settings>): Settings => ({
  "application-font": "Lato",
  "application-font-files": [],
  "available-fonts": [],
  "available-locales": [],
  "enable-public-sharing": false,
  "enable-xrays": false,
  engines: createMockEngines(),
  "is-hosted?": false,
  "loading-message": "doing-science",
  "deprecation-notice-version": undefined,
  "show-database-syncing-modal": false,
  "show-homepage-data": false,
  "show-homepage-xrays": false,
  "show-homepage-pin-message": false,
  "show-lighthouse-illustration": true,
  "show-metabot": true,
  "slack-token": undefined,
  "slack-token-valid?": false,
  "slack-app-token": undefined,
  "slack-files-channel": undefined,
  version: createMockVersion(),
  ...opts,
});
