import { SettingsState } from "metabase-types/store";
import { createMockSettings } from "metabase-types/api/mocks";

export const createMockSettingsState = (
  opts?: Partial<SettingsState>,
): SettingsState => ({
  values: createMockSettings(),
  ...opts,
});
