// The queries use the SDK's `source` API (`{ type: "table", id }`); the database
// is resolved from the SDK's metadata store, so no databaseId is passed.
type TableSource = { type: "table"; id: number };
type CountAggregation = { type: "operator"; operator: "count"; args: [] };

export type DataAppTestEnv = {
  scalarQuery: { source: TableSource; aggregations: CountAggregation[] };
  questionQuery: { source: TableSource };
  // Config for the `/sandboxing` page: URLs it fetches to probe the sandbox's
  // `allowed_hosts` gate. `allowedUrl` is expected to be in `allowed_hosts`,
  // `blockedUrl` is not.
  sandbox?: {
    allowedUrl: string;
    blockedUrl: string;
  };
};

declare global {
  // eslint-disable-next-line no-var -- `var` (not `const`) so `globalThis.x` typechecks
  var __METABASE_DATA_APP_TEST_ENV__: DataAppTestEnv | undefined;
}

export function getTestEnv(): DataAppTestEnv {
  const env = globalThis.__METABASE_DATA_APP_TEST_ENV__;

  if (!env) {
    throw new Error(
      "data-app test env was not injected — pass `testEnv` to H.mockDataApp",
    );
  }

  return env;
}
