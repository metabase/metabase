import fetchMock from "fetch-mock";

import type { SettingDefinition } from "metabase-types/api";

export function setupSettingsEndpoints(settings: SettingDefinition[]) {
  fetchMock.get("path:/api/setting", settings);
}

export function setupUpdateSettingEndpoint(
  { status }: { status?: number } = { status: 204 },
) {
  fetchMock.put(
    new RegExp("/api/setting/"),
    { status },
    { overwriteRoutes: true },
  );
}
