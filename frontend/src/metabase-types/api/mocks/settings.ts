import { Engine, Settings, Version } from "metabase-types/api";

export const createMockEngine = (opts?: Partial<Engine>): Engine => ({
  "display-name": "PostgreSQL",
  "superseded-by": undefined,
  ...opts,
});

export const createMockEngines = (): Record<string, Engine> => ({
  postgres: createMockEngine(),
});

export const createMockVersion = (opts?: Partial<Version>): Version => ({
  tag: "v1",
  ...opts,
});

export const createMockSettings = (opts?: Partial<Settings>): Settings => ({
  "enable-public-sharing": false,
  "enable-xrays": false,
  engines: createMockEngines(),
  "deprecation-notice-version": undefined,
  "show-database-syncing-modal": false,
  "show-homepage-data": false,
  "show-homepage-xrays": false,
  "show-homepage-pin-message": false,
  "slack-token": undefined,
  "slack-token-valid?": true,
  "slack-app-token": undefined,
  "slack-files-channel": undefined,
  version: createMockVersion(),
  ...opts,
});
