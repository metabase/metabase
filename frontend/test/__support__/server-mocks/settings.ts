import fetchMock from "fetch-mock";

import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  SettingDefinition,
} from "metabase-types/api";

export function setupSettingsEndpoints(settings: SettingDefinition[]) {
  fetchMock.get("path:/api/setting", settings);
}

export function setupSettingEndpoint<K extends EnterpriseSettingKey>({
  settingKey,
  settingValue,
}: {
  settingKey: K;
  settingValue: EnterpriseSettingValue<K>;
}) {
  if (settingValue === null || settingValue === undefined) {
    throw new Error("settingValue must be non-null and non-undefined");
  }
  fetchMock.get("path:/api/setting/" + settingKey, settingValue);
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
