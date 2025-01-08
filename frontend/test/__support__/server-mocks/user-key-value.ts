import fetchMock from "fetch-mock";

// TODO: value type?
export function setupGetUserKeyValueEndpoint(
  namespace: string,
  key: string,
  value: any,
) {
  return fetchMock.get(
    `path:/api/user-key-value/namespace/${namespace}/key/${key}`,
    { status: 200, body: value },
    { overwriteRoutes: true },
  );
}

export function setupUpdateUserKeyValueEndpoint(
  namespace: string,
  key: string,
  newValue: any,
) {
  return fetchMock.put(
    `path:/api/user-key-value/namespace/${namespace}/key/${key}`,
    { status: 200, body: newValue },
    { overwriteRoutes: true },
  );
}

export function setupDeleteUserKeyValueEndpoint(
  namespace: string,
  key: string,
) {
  return fetchMock.delete(
    `path:/api/user-key-value/namespace/${namespace}/key/${key}`,
    { status: 200 },
    { overwriteRoutes: true },
  );
}
