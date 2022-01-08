import { Settings } from "metabase-types/api";

export const createMockSettings = (opts?: Partial<Settings>): Settings => ({
  ...opts,
});
