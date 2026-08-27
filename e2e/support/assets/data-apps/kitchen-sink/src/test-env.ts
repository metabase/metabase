// The type is the tests' contract and lives with them; this file is only how the
// app reads it back inside the sandbox realm.
import type { DataAppTestEnv } from "../../../../helpers/data-app-test-env";

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
