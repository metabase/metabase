import type { Settings } from "metabase-types/api";
import type { SettingsState } from "metabase-types/store";
import type { EnterpriseSettings } from "metabase-enterprise/settings/types";

import { createMockSettings } from "metabase-types/api/mocks";

export const createMockSettingsState = (
  opts?: Partial<Settings> | Partial<EnterpriseSettings>,
): SettingsState => ({
  values: createMockSettings(opts),
  loading: false,
});
