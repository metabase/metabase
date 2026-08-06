import path from "node:path";

import { getQuerySyncCredentials } from "../../query-sync/env";
import { syncQueries } from "../../query-sync/sync";

export async function syncQueriesAction(appRoot = process.cwd()) {
  const resolvedRoot = path.resolve(appRoot);
  const credentials = getQuerySyncCredentials(resolvedRoot);
  await syncQueries({ appRoot: resolvedRoot, ...credentials });
}
