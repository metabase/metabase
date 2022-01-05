import { SettingsState } from "metabase-types/store";

export const createSettingsState = (
  opts?: Partial<SettingsState>,
): SettingsState => ({
  values: {},
  ...opts,
});
