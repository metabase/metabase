import { SlackSettings } from "metabase-types/api";

export const createMockSlackSettings = (
  opts?: Partial<SlackSettings>,
): SlackSettings => ({
  ...opts,
});
