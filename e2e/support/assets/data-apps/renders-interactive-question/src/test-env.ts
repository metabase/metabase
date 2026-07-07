export type DataAppTestEnv = {
  scalarQuery: {
    tableId: number;
    databaseId: number;
    aggregations: { type: "count" }[];
  };
  questionQuery: { tableId: number; databaseId: number };
};

declare global {
  const __METABASE_DATA_APP_TEST_ENV__: DataAppTestEnv | undefined;
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
