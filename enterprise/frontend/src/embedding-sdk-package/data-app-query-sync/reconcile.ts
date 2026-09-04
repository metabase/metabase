import fs from "node:fs";
import path from "node:path";

import { QUERY_DEFINITIONS, injectGeneratedId } from "./ast/query-source";
import { getCanonicalQueryJson } from "./canonical";
import { isPositiveInteger } from "./guards";
import { RESOURCE_LOCKFILE, writeResourceLockfile } from "./lockfile";
import { getErrorMessage, getRelativeDefinitionLocation } from "./messages";
import type { MetabaseClient } from "./metabase-client";
import { orNullOn404 } from "./metabase-client";
import { reconcileMetrics, reconcileRemovedMetrics } from "./reconcile-metrics";
import { collectTableIds } from "./table-ids";
import type {
  DiscoveredQuery,
  QueryLockEntry,
  ResourceLockfile,
} from "./types";

type QueryCard = Awaited<ReturnType<MetabaseClient["getCard"]>>;

interface ResolvedQuery {
  query: DiscoveredQuery;
  resolved: Awaited<ReturnType<MetabaseClient["resolveQuery"]>>;
}

interface ReconciliationContext {
  appRoot: string;
  collectionId: number;
  client: MetabaseClient;
  lockfile: ResourceLockfile;
  recoveredIds: Map<DiscoveredQuery, number>;
  repairedLockfileIds: Set<number>;
  cardsById: Map<number, QueryCard | null>;
  log: (message: string) => void;
}

export interface ReconcileQueriesOptions {
  appRoot: string;
  slug: string;
  collectionId: number;
  queries: DiscoveredQuery[];
  lockfile: ResourceLockfile;
  client: MetabaseClient;
  log: (message: string) => void;
}

function queryWithoutGeneratedId(query: DiscoveredQuery) {
  const authored = { ...query.query };
  delete authored.savedQuestionSourceId;
  return authored;
}

function lockEntry(query: DiscoveredQuery, id: number): QueryLockEntry {
  return {
    tableId: query.tableId,
    hash: query.hash,
    savedQuestionSourceId: id,
  };
}

function replaceLockEntry(
  entries: QueryLockEntry[],
  previousId: number | undefined,
  next: QueryLockEntry,
) {
  const index = previousId
    ? entries.findIndex(
        ({ savedQuestionSourceId }) => savedQuestionSourceId === previousId,
      )
    : -1;
  if (index >= 0) {
    entries[index] = next;
  } else {
    entries.push(next);
  }
}

function recoverMissingQueryIds(
  appRoot: string,
  queries: DiscoveredQuery[],
  previousEntries: QueryLockEntry[],
) {
  const claimedIds = new Set(
    queries.flatMap(({ savedQuestionSourceId }) =>
      savedQuestionSourceId ? [savedQuestionSourceId] : [],
    ),
  );
  const recoveredIds = new Map<DiscoveredQuery, number>();

  for (const query of queries) {
    if (query.savedQuestionSourceId) {
      continue;
    }

    const candidates = previousEntries.filter(
      (entry) =>
        entry.tableId === query.tableId &&
        entry.hash === query.hash &&
        !claimedIds.has(entry.savedQuestionSourceId),
    );

    if (candidates.length > 1) {
      throw new Error(
        `${getRelativeDefinitionLocation(appRoot, query)} matches multiple lockfile entries. Restore its savedQuestionSourceId manually and run sync-resources again.`,
      );
    }

    const [candidate] = candidates;

    if (candidate) {
      recoveredIds.set(query, candidate.savedQuestionSourceId);
      claimedIds.add(candidate.savedQuestionSourceId);
    }
  }

  return recoveredIds;
}

function savedQuestionId(
  query: DiscoveredQuery,
  recoveredIds: Map<DiscoveredQuery, number>,
) {
  return query.savedQuestionSourceId ?? recoveredIds.get(query);
}

async function resolveQueries(
  appRoot: string,
  slug: string,
  queries: DiscoveredQuery[],
  client: MetabaseClient,
): Promise<ResolvedQuery[]> {
  return Promise.all(
    queries.map(async (query) => {
      try {
        return {
          query,
          resolved: await client.resolveQuery(
            slug,
            queryWithoutGeneratedId(query),
          ),
        };
      } catch (error) {
        throw new Error(
          `Could not resolve ${getRelativeDefinitionLocation(appRoot, query)}: ${getErrorMessage(error)}`,
        );
      }
    }),
  );
}

async function fetchReferencedCards(
  queries: DiscoveredQuery[],
  recoveredIds: Map<DiscoveredQuery, number>,
  client: MetabaseClient,
) {
  const cardsById = new Map<number, QueryCard | null>();
  await Promise.all(
    queries.map(async (query) => {
      const id = savedQuestionId(query, recoveredIds);

      if (!id) {
        return;
      }

      cardsById.set(id, await orNullOn404(client.getCard(id)));
    }),
  );
  return cardsById;
}

function findLockfileRepairs(
  queries: DiscoveredQuery[],
  recoveredIds: Map<DiscoveredQuery, number>,
  entries: QueryLockEntry[],
  cardsById: Map<number, QueryCard | null>,
  collectionId: number,
) {
  const repairs: Array<{ query: DiscoveredQuery; id: number }> = [];

  for (const query of queries) {
    const id = savedQuestionId(query, recoveredIds);

    if (!id) {
      continue;
    }

    const card = cardsById.get(id);

    if (card && card.id !== id) {
      throw new Error(
        `The Card API returned card ${card.id} when card ${id} was requested.`,
      );
    }

    if (!card) {
      continue;
    }

    const isLockfileProven = entries.some(
      ({ savedQuestionSourceId }) => savedQuestionSourceId === id,
    );

    if (isLockfileProven) {
      if (card.type !== "question") {
        throw new Error(`Card ${id} is no longer a saved question.`);
      }

      continue;
    }

    if (card.archived === true) {
      throw new Error(
        `${query.exportName} references card ${id}, which is in the trash. Restore it to data app collection ${collectionId} to publish it again, or drop \`savedQuestionSourceId: ${id}\` from the declaration to publish a new copy, then run sync-resources again.`,
      );
    }

    if (card.type !== "question" || card.collection_id !== collectionId) {
      throw new Error(
        `${query.exportName} references card ${id}, but the lockfile does not prove ownership and the card cannot be safely adopted.`,
      );
    }

    repairs.push({ query, id });
  }

  return repairs;
}

function applyLockfileRepairs(
  appRoot: string,
  lockfile: ResourceLockfile,
  repairs: Array<{ query: DiscoveredQuery; id: number }>,
) {
  const repairedIds = new Set<number>();

  for (const { query, id } of repairs) {
    lockfile.queries.push(lockEntry(query, id));
    writeResourceLockfile(appRoot, lockfile);
    repairedIds.add(id);
  }

  return repairedIds;
}

function queriesMatch(card: QueryCard, resolved: ResolvedQuery["resolved"]) {
  return (
    getCanonicalQueryJson(card.dataset_query) ===
    getCanonicalQueryJson(resolved.dataset_query)
  );
}

function logExistingCardOutcome(
  context: ReconciliationContext,
  query: DiscoveredQuery,
  card: QueryCard,
  existingEntry: QueryLockEntry,
  needsUpdate: boolean,
) {
  const { recoveredIds, repairedLockfileIds, log } = context;
  const recoveredId = recoveredIds.get(query);

  if (needsUpdate) {
    const authoredChanged =
      existingEntry.tableId !== query.tableId ||
      existingEntry.hash !== query.hash;
    const action =
      authoredChanged || card.name !== query.exportName
        ? "updated"
        : "restored";
    const checkpoint = recoveredId
      ? "restored source ID, "
      : repairedLockfileIds.has(card.id)
        ? "repaired lockfile, "
        : "";

    log(`${checkpoint}${action}: card ${card.id}`);
  } else if (recoveredId) {
    log(`restored source ID: ${query.exportName} -> card ${card.id}`);
  } else if (repairedLockfileIds.has(card.id)) {
    log(`repaired lockfile: ${query.exportName} -> card ${card.id}`);
  } else {
    log(`unchanged: card ${card.id}`);
  }
}

async function reconcileLiveQuery(
  context: ReconciliationContext,
  { query, resolved }: ResolvedQuery,
) {
  const { appRoot, collectionId, client, lockfile, recoveredIds, cardsById } =
    context;
  const authoritative = {
    name: query.exportName,
    collectionId,
    datasetQuery: resolved.dataset_query,
  };
  const recoveredId = recoveredIds.get(query);
  const previousId = savedQuestionId(query, recoveredIds);
  const card = previousId ? cardsById.get(previousId) : null;

  if (!card) {
    const created = await client.createCard(authoritative);

    if (!isPositiveInteger(created.id)) {
      throw new Error("The Card API did not return a valid saved question ID.");
    }

    injectGeneratedId(query, QUERY_DEFINITIONS, created.id);
    replaceLockEntry(
      lockfile.queries,
      previousId,
      lockEntry(query, created.id),
    );
    writeResourceLockfile(appRoot, lockfile);
    context.log(
      previousId
        ? `recreated: card ${previousId} -> card ${created.id}`
        : `created: ${query.exportName} -> card ${created.id}`,
    );

    return created.id;
  }

  if (recoveredId) {
    injectGeneratedId(query, QUERY_DEFINITIONS, recoveredId);
  }

  const existingEntry = lockfile.queries.find(
    ({ savedQuestionSourceId }) => savedQuestionSourceId === card.id,
  );

  if (!existingEntry) {
    throw new Error(
      `${query.exportName} references card ${card.id}, but the lockfile does not prove ownership.`,
    );
  }

  if (card.type !== "question") {
    throw new Error(`Card ${card.id} is no longer a saved question.`);
  }

  const needsUpdate =
    card.name !== query.exportName ||
    card.collection_id !== collectionId ||
    // A copy trashed on its own keeps its collection, so only `archived` says so.
    card.archived === true ||
    !queriesMatch(card, resolved);

  if (needsUpdate) {
    await client.updateCard(card.id, authoritative);
  }

  logExistingCardOutcome(context, query, card, existingEntry, needsUpdate);
  replaceLockEntry(lockfile.queries, card.id, lockEntry(query, card.id));
  writeResourceLockfile(appRoot, lockfile);

  return card.id;
}

async function reconcileLiveQueries(
  context: ReconciliationContext,
  resolvedQueries: ResolvedQuery[],
) {
  const liveIds = new Set<number>();

  for (const resolvedQuery of resolvedQueries) {
    liveIds.add(await reconcileLiveQuery(context, resolvedQuery));
  }

  return liveIds;
}

function removeLockEntry(
  appRoot: string,
  lockfile: ResourceLockfile,
  id: number,
) {
  const index = lockfile.queries.findIndex(
    ({ savedQuestionSourceId }) => savedQuestionSourceId === id,
  );

  if (index >= 0) {
    lockfile.queries.splice(index, 1);
    writeResourceLockfile(appRoot, lockfile);
  }
}

async function reconcileRemovedQueries(
  context: ReconciliationContext,
  previousEntries: QueryLockEntry[],
  liveIds: Set<number>,
) {
  const { appRoot, collectionId, client, lockfile, log } = context;
  for (const entry of previousEntries) {
    if (liveIds.has(entry.savedQuestionSourceId)) {
      continue;
    }

    const card = await orNullOn404(client.getCard(entry.savedQuestionSourceId));

    if (!card) {
      removeLockEntry(appRoot, lockfile, entry.savedQuestionSourceId);

      continue;
    }

    // The trash masks a card's collection, so a copy trashed from the app
    // collection reads the same as one moved out and trashed afterwards. Stop
    // tracking it either way: deleting is permanent, and the card is already
    // where someone put it to be deleted.
    if (card.archived === true) {
      removeLockEntry(appRoot, lockfile, card.id);
      log(`left in the trash: card ${card.id}`);

      continue;
    }

    if (card.type !== "question" || card.collection_id !== collectionId) {
      const recovery =
        card.type === "question"
          ? `Move card ${card.id} back to data app collection ${collectionId} or delete it manually`
          : `Change card ${card.id} back to a saved question in data app collection ${collectionId} or delete it manually`;

      throw new Error(
        `Card ${card.id} belongs to a removed query but is no longer an owned question in the data app collection, so it was left untouched. ${recovery}, then run sync-resources again.`,
      );
    }

    await client.deleteCard(card.id);

    removeLockEntry(appRoot, lockfile, card.id);
    log(`deleted: card ${card.id}`);
  }
}

export async function reconcileQueries({
  appRoot,
  slug,
  collectionId,
  queries,
  lockfile,
  client,
  log,
}: ReconcileQueriesOptions) {
  const previousEntries = [...lockfile.queries];
  const recoveredIds = recoverMissingQueryIds(
    appRoot,
    queries,
    previousEntries,
  );
  const resolvedQueries = await resolveQueries(appRoot, slug, queries, client);
  const metricReconciliation = await reconcileMetrics({
    appRoot,
    collectionId,
    resolvedQueries: resolvedQueries.map(({ resolved }) => resolved),
    lockfile,
    client,
    log,
  });
  const cardsById = await fetchReferencedCards(queries, recoveredIds, client);
  const repairs = findLockfileRepairs(
    queries,
    recoveredIds,
    lockfile.queries,
    cardsById,
    collectionId,
  );
  const repairedLockfileIds = applyLockfileRepairs(appRoot, lockfile, repairs);
  const context: ReconciliationContext = {
    appRoot,
    collectionId,
    client,
    lockfile,
    recoveredIds,
    repairedLockfileIds,
    cardsById,
    log,
  };
  const liveIds = await reconcileLiveQueries(context, resolvedQueries);

  await reconcileRemovedMetrics({
    appRoot,
    collectionId,
    ...metricReconciliation,
    lockfile,
    client,
    log,
  });
  await reconcileRemovedQueries(context, previousEntries, liveIds);

  if (!fs.existsSync(path.join(appRoot, RESOURCE_LOCKFILE))) {
    writeResourceLockfile(appRoot, lockfile);
  }

  const queryTableIds = resolvedQueries.flatMap(
    ({ resolved }) => resolved.table_ids,
  );
  const metricTableIds = collectTableIds(
    resolvedQueries.flatMap(({ resolved }) =>
      resolved.metrics.map((metric) => metric.dataset_query),
    ),
  );

  return [...new Set([...queryTableIds, ...metricTableIds])].sort(
    (a, b) => a - b,
  );
}
