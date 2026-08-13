import path from "node:path";

import { getQuerySyncCredentials } from "../../data-app-query-sync/env";
import { syncQueries } from "../../data-app-query-sync/sync";

export async function syncQueriesAction(appRoot = process.cwd()) {
  const resolvedRoot = path.resolve(appRoot);
  await syncQueries({
    appRoot: resolvedRoot,
    ...getQuerySyncCredentials(resolvedRoot),
  });
}
