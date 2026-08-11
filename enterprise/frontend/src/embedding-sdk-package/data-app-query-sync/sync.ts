import path from "node:path";

import { discoverQueries } from "./discover";
import { readQueryLockfile } from "./lockfile";
import { MetabaseClient } from "./metabase-client";
import { reconcileQueries } from "./reconcile";

interface SyncQueriesOptions {
  appRoot: string;
  metabaseUrl: string;
  apiKey: string;
  log?: (message: string) => void;
}

export async function syncQueries({
  appRoot,
  metabaseUrl,
  apiKey,
  log = (message) => process.stdout.write(`${message}\n`),
}: SyncQueriesOptions) {
  const queries = await discoverQueries(appRoot);
  const previousEntries = readQueryLockfile(appRoot);
  const client = new MetabaseClient(metabaseUrl, apiKey);
  const slug = path.basename(appRoot);
  const app = await client.ensureDraft(slug);
  const databaseIds = await reconcileQueries({
    appRoot,
    slug,
    collectionId: app.resource_collection_id,
    queries,
    previousEntries,
    client,
    log,
  });
  await client.reconcilePermissions(slug, databaseIds);
}
