import type { Settings } from "metabase-types/api";
import type { SettingsState } from "metabase-types/store";
import { createMockSettings } from "metabase-types/api/mocks";

export const createMockSettingsState = (
  opts?: Partial<Settings>,
): SettingsState => ({
  values: createMockSettings(opts),
  loading: false,
});
