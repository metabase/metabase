import type { SlackAppInfo, SlackSettings } from "metabase-types/api";

export const createMockSlackSettings = (
  opts?: Partial<SlackSettings>,
): SlackSettings => ({
  "slack-app-token": null,
  "slack-bug-report-channel": null,
  ...opts,
});

export const createMockSlackAppInfo = (
  opts?: Partial<SlackAppInfo>,
): SlackAppInfo => ({
  app_id: "test-app-id",
  team_id: "test-team-id",
  scopes: {
    actual: [],
    required: [],
    missing: [],
    extra: [],
  },
  ...opts,
});
