import fetchMock from "fetch-mock";

import type { UserKeyValue, UserKeyValueKey } from "metabase-types/api";

export const setupUserKeyValueEndpoints = ({
  namespace,
  key,
  value,
}: UserKeyValue) => {
  // Fetch Mock doesn't seem to work when you use calls(name) and name has underscores *sigh*
  const name = `user-key-value-${namespace}-${key}`.replace("_", "-");

  const getName = `get-${name}`;
  const putName = `put-${name}`;

  fetchMock.get(
    `path:/api/user-key-value/namespace/${namespace}/key/${key}`,
    {
      status: 200,
      body: value,
    },
    {
      name: getName,
    },
  );

  fetchMock.put(
    `path:/api/user-key-value/namespace/${namespace}/key/${key}`,
    {
      status: 200,
    },
    {
      name: putName,
    },
  );

  fetchMock.delete(
    `path:/api/user-key-value/namespace/${namespace}/key/${key}`,
    { status: 200 },
  );

  return {
    names: {
      get: getName,
      put: putName,
    },
  };
};

export function setupGetUserKeyValueEndpoint(kv: UserKeyValue) {
  return fetchMock.get(
    `path:/api/user-key-value/namespace/${kv.namespace}/key/${kv.key}`,
    { status: 200, body: kv.value },
    { overwriteRoutes: true },
  );
}

export function setupNullGetUserKeyValueEndpoints() {
  return fetchMock.get(
    `express:/api/user-key-value/namespace/:namespace/key/:key`,
    { status: 200 },
    { overwriteRoutes: true },
  );
}

export function setupUpdateUserKeyValueEndpoint(kv: UserKeyValue) {
  return fetchMock.put(
    `path:/api/user-key-value/namespace/${kv.namespace}/key/${kv.key}`,
    { status: 200, body: kv.value },
    { overwriteRoutes: true },
  );
}

export function setupDeleteUserKeyValueEndpoint(k: UserKeyValueKey) {
  return fetchMock.delete(
    `path:/api/user-key-value/namespace/${k.namespace}/key/${k.key}`,
    { status: 200 },
    { overwriteRoutes: true },
  );
}

export function setupUserAcknowledgementEndpoints({
  key,
  value,
}: {
  key: string;
  value: boolean;
}) {
  return setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key,
    value,
  });
}

export function setupLastDownloadFormatEndpoints({
  last_download_format = "csv" as const,
  last_table_download_format = "csv" as const,
} = {}) {
  return setupUserKeyValueEndpoints({
    namespace: "last_download_format",
    key: "download_format_preference",
    value: {
      last_download_format,
      last_table_download_format,
    },
  });
}
