import type { SlackSettings } from "metabase-types/api";

export const createMockSlackSettings = (
  opts?: Partial<SlackSettings>,
): SlackSettings => ({
  "slack-app-token": null,
  "slack-files-channel": null,
  ...opts,
});
