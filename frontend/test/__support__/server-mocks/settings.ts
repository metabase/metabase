import fetchMock from "fetch-mock";

import type {
  MaskedScimApiKey,
  UnmaskedScimApiKey,
} from "metabase-enterprise/user_provisioning/types";
import type {
  EnterpriseSettingKey,
  EnterpriseSettingValue,
  EnterpriseSettings,
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

/**
 * Stateful settings mocks for save-then-read tests: PUT /api/setting(/:key)
 * mutate a shared store that GET /api/session/properties returns, so the
 * post-save refetch reflects the write instead of the pre-save snapshot.
 * Returns the mutable store for assertions.
 */
export function setupStatefulSettingsEndpoints(
  initialSettings: Partial<EnterpriseSettings> | Record<string, unknown>,
) {
  const store: Record<string, unknown> = { ...initialSettings };

  fetchMock.removeRoute("get-session-properties");
  fetchMock.get("path:/api/session/properties", () => ({ ...store }), {
    name: "get-session-properties",
  });

  fetchMock.removeRoute("update-setting");
  fetchMock.put(
    new RegExp("/api/setting/(.+)"),
    ({ url, options }) => {
      const key = decodeURIComponent(url.split("/api/setting/")[1]);
      // Unjustified type cast. FIXME
      const { value } = JSON.parse(options.body as string);
      store[key] = value;
      return { status: 204 };
    },
    { name: "update-setting" },
  );

  fetchMock.removeRoute("update-settings");
  fetchMock.put(
    "path:/api/setting",
    ({ options }) => {
      // Unjustified type cast. FIXME
      Object.assign(store, JSON.parse(options.body as string));
      return { status: 204 };
    },
    { name: "update-settings" },
  );

  return store;
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

export function setupUpsellEndpoints() {
  fetchMock.get(
    "path:/api/user-key-value/namespace/user_acknowledgement/key/upsell-embedding-methods",
    { status: 204 },
  );
}

export function setupGenerateRandomTokenEndpoint(token: string) {
  fetchMock.get(
    "path:/api/util/random_token",
    { token },
    { name: "generate-random-token" },
  );
}
