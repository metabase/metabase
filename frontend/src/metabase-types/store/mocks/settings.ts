import { SettingsState } from "metabase-types/store";

export const createMockSettingsState = (
  opts?: Partial<SettingsState>,
): SettingsState => ({
  values: {},
  ...opts,
});
