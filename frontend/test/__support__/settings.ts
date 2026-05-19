import { createMockSettingsState } from "metabase/redux/store/mocks";
import MetabaseSettings from "metabase/utils/settings";
import type { EnterpriseSettings, Settings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

/**
 * This function mocks the settings also in MetabaseSettings,
 * without that, you'll get the annoying "Unknown premium feature xxx" warning.
 */
export function mockSettings(
  params: Partial<Settings | EnterpriseSettings> = {},
) {
  const settings = createMockSettings(params);
  const state = createMockSettingsState(settings);

  MetabaseSettings.setAll(settings);

  return state;
}
