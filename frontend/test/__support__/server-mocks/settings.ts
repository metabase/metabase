import fetchMock from "fetch-mock";

import type { SettingDefinition } from "metabase-types/api";

export function setupSettingsEndpoints(settings: SettingDefinition[]) {
  fetchMock.get("path:/api/setting", settings);
}
