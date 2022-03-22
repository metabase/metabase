import { Engine, Settings, Version } from "metabase-types/api";

export const createMockEngine = (opts?: Partial<Engine>): Engine => ({
  "driver-name": "PostgreSQL",
  "superseded-by": undefined,
  ...opts,
});

export const createMockEngines = (
  opts?: Record<string, Engine>,
): Record<string, Engine> => ({
  postgres: createMockEngine(),
  ...opts,
});

export const createMockVersion = (opts?: Partial<Version>): Version => ({
  tag: "v1",
  ...opts,
});

export const createMockSettings = (opts?: Partial<Settings>): Settings => ({
  "enable-public-sharing": false,
  "enable-xrays": false,
  engines: createMockEngines(),
  "is-hosted?": false,
  "deprecation-notice-version": undefined,
  "show-database-syncing-modal": false,
  "show-homepage-data": false,
  "show-homepage-xrays": false,
  "show-homepage-pin-message": false,
  "slack-token": undefined,
  "slack-token-valid?": false,
  "slack-app-token": undefined,
  "slack-files-channel": undefined,
  version: createMockVersion(),
  ...opts,
});
