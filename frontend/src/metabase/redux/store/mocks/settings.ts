import type { SettingsState } from "metabase/redux/store";
import type { EnterpriseSettings, Settings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

export const createMockSettingsState = (
  opts?: Partial<Settings> | Partial<EnterpriseSettings>,
): SettingsState => ({
  values: createMockSettings(opts),
  loading: false,
});
