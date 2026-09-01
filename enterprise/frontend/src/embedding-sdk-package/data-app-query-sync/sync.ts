import path from "node:path";

import { discoverActions, discoverQueries } from "./discover";
import { isPositiveInteger } from "./guards";
import {
  RESOURCE_LOCKFILE,
  readResourceLockfile,
  writeResourceLockfile,
} from "./lockfile";
import { MetabaseClient, orNullOn404 } from "./metabase-client";
import { reconcileQueries } from "./reconcile";
import { reconcileModels } from "./reconcile-models";
import type { DiscoveredAction, ResourceLockfile } from "./types";

export interface SyncResourcesOptions {
  appRoot: string;
  metabaseUrl: string;
  apiKey: string;
  log?: (message: string) => void;
}

function staleDefinition(
  appRoot: string,
  definition: { filePath: string; exportName: string },
): never {
  throw new Error(
    `${path.relative(appRoot, definition.filePath)}:${definition.exportName} is not synchronized. Run \`npm run sync-resources\` and rebuild.`,
  );
}

function checkQueriesSynchronized(
  appRoot: string,
  queries: Awaited<ReturnType<typeof discoverQueries>>,
  lockfile: ResourceLockfile,
) {
  const byId = new Map(
    lockfile.queries.map((entry) => [entry.savedQuestionSourceId, entry]),
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
      staleDefinition(appRoot, query);
    }
  }
  const liveIds = new Set(
    queries.flatMap(({ savedQuestionSourceId }) =>
      savedQuestionSourceId ? [savedQuestionSourceId] : [],
    ),
  );
  if (
    lockfile.queries.some(
      ({ savedQuestionSourceId }) => !liveIds.has(savedQuestionSourceId),
    )
  ) {
    throw new Error(
      `${RESOURCE_LOCKFILE} contains a removed query. Run \`npm run sync-resources\` and rebuild.`,
    );
  }
}

function checkActionsSynchronized(
  appRoot: string,
  actions: DiscoveredAction[],
  lockfile: ResourceLockfile,
) {
  const byId = new Map(
    lockfile.models.flatMap((model) =>
      model.actions.map((entry) => [entry.sourceActionId, entry] as const),
    ),
  );

  for (const action of actions) {
    const entry = byId.get(action.sourceActionId);

    if (!entry || entry.copiedActionId !== action.copiedActionId) {
      staleDefinition(appRoot, action);
    }
  }

  const liveIds = new Set(actions.map(({ sourceActionId }) => sourceActionId));
  const hasRemovedAction = lockfile.models.some(
    (model) =>
      model.actions.length === 0 ||
      model.actions.some(({ sourceActionId }) => !liveIds.has(sourceActionId)),
  );

  if (hasRemovedAction) {
    throw new Error(
      `${RESOURCE_LOCKFILE} contains a removed action. Run \`npm run sync-resources\` and rebuild.`,
    );
  }
}

export async function checkResourcesSynced(appRoot: string) {
  const [queries, actions] = await Promise.all([
    discoverQueries(appRoot),
    discoverActions(appRoot),
  ]);
  const lockfile = readResourceLockfile(appRoot);

  checkQueriesSynchronized(appRoot, queries, lockfile);
  checkActionsSynchronized(appRoot, actions, lockfile);
}

/**
 * Move synchronized copies when the app gets a new collection. Collection read
 * access lets app viewers run the copies. Move only copies that remain in the
 * previous synchronized collection.
 */
async function moveCopiesToAppCollection(
  appRoot: string,
  lockfile: ResourceLockfile,
  collectionId: number,
  client: MetabaseClient,
  log: (message: string) => void,
) {
  const previousCollectionId = lockfile.collectionId;

  if (previousCollectionId === collectionId) {
    return;
  }

  if (previousCollectionId !== undefined) {
    const copiedCardIds = [
      ...lockfile.queries.map((entry) => entry.savedQuestionSourceId),
      ...lockfile.models.map((entry) => entry.copiedModelId),
      ...lockfile.metrics.map((entry) => entry.copiedMetricId),
    ];

    for (const cardId of copiedCardIds) {
      const card = await orNullOn404(client.getCard(cardId));

      if (card?.collection_id !== previousCollectionId) {
        continue;
      }

      await client.moveCardToCollection(cardId, collectionId);
      log(`moved card ${cardId} into data app collection ${collectionId}`);
    }
  }

  lockfile.collectionId = collectionId;
  writeResourceLockfile(appRoot, lockfile);
}

export async function syncResources({
  appRoot,
  metabaseUrl,
  apiKey,
  log = (message) => process.stdout.write(`${message}\n`),
}: SyncResourcesOptions) {
  const [queries, actions] = await Promise.all([
    discoverQueries(appRoot),
    discoverActions(appRoot),
  ]);
  const lockfile = readResourceLockfile(appRoot);
  const client = new MetabaseClient(metabaseUrl, apiKey);
  const slug = path.basename(appRoot);
  const app = await client.ensureDraft(slug);
  if (!isPositiveInteger(app.resource_collection_id)) {
    throw new Error(`Data app ${slug} does not have a resource collection.`);
  }

  await moveCopiesToAppCollection(
    appRoot,
    lockfile,
    app.resource_collection_id,
    client,
    log,
  );

  await reconcileQueries({
    appRoot,
    slug,
    collectionId: app.resource_collection_id,
    queries,
    lockfile,
    client,
    log,
  });
  await reconcileModels({
    appRoot,
    collectionId: app.resource_collection_id,
    actions,
    lockfile,
    client,
    log,
  });
}
