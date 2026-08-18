import path from "node:path";

import { discoverQueries } from "./discover";
import { isPositiveInteger } from "./guards";
import { readQueryLockfile } from "./lockfile";
import { addResourceEntityIdsToManifest } from "./manifest";
import { MetabaseClient } from "./metabase-client";
import { reconcileQueries } from "./reconcile";

export interface SyncQueriesOptions {
  appRoot: string;
  metabaseUrl: string;
  apiKey: string;
  log?: (message: string) => void;
}

export async function checkQuerySync(appRoot: string) {
  const [queries, entries] = await Promise.all([
    discoverQueries(appRoot),
    Promise.resolve(readQueryLockfile(appRoot)),
  ]);
  const byId = new Map(
    entries.map((entry) => [entry.savedQuestionSourceId, entry]),
  );
  for (const query of queries) {
    const id = query.savedQuestionSourceId;
    const entry = id ? byId.get(id) : undefined;
    if (
      !id ||
      !entry ||
      entry.tableId !== query.tableId ||
      entry.hash !== query.hash
    ) {
      throw new Error(
        `${path.relative(appRoot, query.filePath)}:${query.exportName} is not synchronized. Run \`npm run sync-queries\` and rebuild.`,
      );
    }
  }
  const liveIds = new Set(
    queries.flatMap(({ savedQuestionSourceId }) =>
      savedQuestionSourceId ? [savedQuestionSourceId] : [],
    ),
  );
  if (
    entries.some(
      ({ savedQuestionSourceId }) => !liveIds.has(savedQuestionSourceId),
    )
  ) {
    throw new Error(
      `queries_metadata.json contains a removed query. Run \`npm run sync-queries\` and rebuild.`,
    );
  }
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

  if (!isPositiveInteger(app.resource_collection_id)) {
    throw new Error(`Data app ${slug} does not have a resource collection.`);
  }

  addResourceEntityIdsToManifest(appRoot, {
    resourceCollectionEntityId: app.resource_collection_entity_id,
    permissionGroupEntityId: app.permission_group_entity_id,
  });

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
