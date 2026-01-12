import fetchMock from "fetch-mock";

import type {
  MaskedScimApiKey,
  UnmaskedScimApiKey,
} from "metabase-enterprise/user_provisioning/types";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  SettingDefinition,
} from "metabase-types/api";

export function setupSettingsEndpoints(settings: SettingDefinition[]) {
  fetchMock.get("path:/api/setting", settings, { name: "settings-list" });
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
  fetchMock.get(
    "path:/api/setting/" + settingKey,
    { body: settingValue },
    { name: `setting-${settingKey}` },
  );
}

export function setupUpdateSettingEndpoint(
  { status }: { status?: number } = { status: 204 },
) {
  const name = "update-setting";
  fetchMock.removeRoute(name);
  fetchMock.put(new RegExp("/api/setting/"), { status }, { name: name });
}

export function setupUpdateSettingsEndpoint(
  { status }: { status?: number } = { status: 204 },
) {
  fetchMock.put("path:/api/setting", { status });
}

export function setupScimEndpoints(
  payload: MaskedScimApiKey | UnmaskedScimApiKey,
) {
  fetchMock.get("path:/api/ee/scim/api_key", payload);
  fetchMock.post("path:/api/ee/scim/api_key", payload);
}
