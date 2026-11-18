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
  { status, body }: { status?: number; body?: unknown } = { status: 204 },
) {
  const name = "update-setting";
  fetchMock.removeRoute(name);
  fetchMock.put(
    new RegExp("/api/setting/"),
    body === undefined ? { status } : { status, body },
    { name: name },
  );
}

/**
 * Stateful settings mocks for save-then-read tests: PUT /api/setting(/:key)
 * mutate a shared store that GET /api/session/properties returns, so the
 * post-save refetch reflects the write instead of the pre-save snapshot.
 * Returns the mutable store for assertions.
 */
export function setupStatefulSettingsEndpoints(
  initialSettings: Partial<EnterpriseSettings> | Record<string, unknown>,
  { updateDelay, readDelay }: { updateDelay?: number; readDelay?: number } = {},
) {
  const store: Record<string, unknown> = { ...initialSettings };

  fetchMock.removeRoute("get-session-properties");
  fetchMock.get("path:/api/session/properties", () => ({ ...store }), {
    name: "get-session-properties",
    delay: readDelay,
  });

  fetchMock.removeRoute("update-setting");
  fetchMock.put(
    new RegExp("/api/setting/(.+)"),
    ({ url, options }) => {
      const key = decodeURIComponent(url.split("/api/setting/")[1]);
      const { value } = JSON.parse(String(options.body));
      store[key] = value;
      return { status: 204 };
    },
    { name: "update-setting", delay: updateDelay },
  );

  fetchMock.removeRoute("update-settings");
  fetchMock.put(
    "path:/api/setting",
    ({ options }) => {
      Object.assign(store, JSON.parse(String(options.body)));
      return { status: 204 };
    },
    { name: "update-settings", delay: updateDelay },
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

/**
 * An in-memory stand-in for `/api/ee/scim/api_key`. GET returns a 404 until a
 * token exists, then the masked token. Every POST issues a new token with its
 * own `mb_<n>…` prefix and stores it inside the handler, or answers 500 while
 * `store.failGeneration` is set. Returns the store for assertions.
 */
export function setupStatefulScimEndpoints({
  hasToken = false,
  failGeneration = false,
  delay,
}: {
  hasToken?: boolean;
  failGeneration?: boolean;
  delay?: number;
} = {}) {
  const store: {
    token: UnmaskedScimApiKey | null;
    issuedTokens: number;
    failGeneration: boolean;
  } = { token: null, issuedTokens: 0, failGeneration };

  const issueToken = (): UnmaskedScimApiKey => {
    store.issuedTokens += 1;
    const unmaskedKey = `mb_${store.issuedTokens}Tok${"s".repeat(36)}`;
    const prefix = unmaskedKey.slice(0, 7);
    return {
      id: store.issuedTokens,
      scope: "scim",
      key: "$2a$10$hashed",
      key_prefix: prefix,
      masked_key: `${prefix}${"*".repeat(40)}`,
      unmasked_key: unmaskedKey,
      name: `SCIM API Key - ${store.issuedTokens}`,
      user_id: null,
      created_at: "2025-01-12T16:08:20.164094Z",
      creator_id: 1,
      updated_at: "2025-01-12T16:08:20.164094Z",
      updated_by_id: 1,
    };
  };

  if (hasToken) {
    store.token = issueToken();
  }

  fetchMock.get(
    "path:/api/ee/scim/api_key",
    () => {
      if (!store.token) {
        return 404;
      }
      const { unmasked_key: _unmaskedKey, ...maskedToken } = store.token;
      return maskedToken;
    },
    { name: "get-scim-token", delay },
  );

  fetchMock.post(
    "path:/api/ee/scim/api_key",
    () => {
      if (store.failGeneration) {
        return { status: 500, body: { message: "An error occurred" } };
      }
      store.token = issueToken();
      return store.token;
    },
    { name: "generate-scim-token", delay },
  );

  return store;
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

export function setupTimezonesEndpoint(timezones: string[]) {
  fetchMock.get("path:/api/setting/available-timezones", timezones);
}
