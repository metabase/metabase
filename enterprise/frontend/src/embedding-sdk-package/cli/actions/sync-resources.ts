import path from "node:path";

import { getResourceSyncCredentials } from "../../data-app-query-sync/env";
import { syncResources } from "../../data-app-query-sync/sync";

export async function syncResourcesAction(appRoot = process.cwd()) {
  const resolvedRoot = path.resolve(appRoot);
  await syncResources({
    appRoot: resolvedRoot,
    ...getResourceSyncCredentials(resolvedRoot),
  });
}
