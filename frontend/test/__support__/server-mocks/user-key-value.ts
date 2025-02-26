import fetchMock from "fetch-mock";

import type { UserKeyValue, UserKeyValueKey } from "metabase-types/api";

export const setupUserKeyValueEndpoints = ({
  namespace,
  key,
  value,
}: UserKeyValue) => {
  fetchMock.get(`path:/api/user-key-value/namespace/${namespace}/key/${key}`, {
    status: 200,
    body: value,
  });

  fetchMock.put(`path:/api/user-key-value/namespace/${namespace}/key/${key}`, {
    status: 200,
  });

  fetchMock.delete(
    `path:/api/user-key-value/namespace/${namespace}/key/${key}`,
    { status: 200 },
  );
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
