import MetabaseSettings from "metabase/lib/settings";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";
import type { Settings } from "metabase-types/api";

export function mockSettings(params: Partial<Settings> = {}) {
  const settings = createMockSettings(params);
  const state = createMockSettingsState(settings);

  MetabaseSettings.setAll(settings);

  return state;
}
