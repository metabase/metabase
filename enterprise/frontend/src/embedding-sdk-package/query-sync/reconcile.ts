import fs from "node:fs";
import path from "node:path";

import { canonicalJson, stripGeneratedQueryIds } from "./canonical";
import { injectSavedQuestionId } from "./discover";
import { writeQueryLockfile } from "./lockfile";
import type { MetabaseClient } from "./metabase-client";
import { MetabaseApiError } from "./metabase-client";
import type { DiscoveredQuery, QueryLockEntry } from "./types";

type QueryCard = Awaited<ReturnType<MetabaseClient["getCard"]>>;

interface ResolvedQuery {
  query: DiscoveredQuery;
  resolved: Awaited<ReturnType<MetabaseClient["resolveQuery"]>>;
}

interface ReconciliationContext {
  appRoot: string;
  collectionId: number;
  client: MetabaseClient;
  entries: QueryLockEntry[];
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
  previousEntries: QueryLockEntry[];
  client: MetabaseClient;
  log: (message: string) => void;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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

function queryLocation(appRoot: string, query: DiscoveredQuery) {
  return `${path.relative(appRoot, query.filePath)}:${query.exportName}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
        `${queryLocation(appRoot, query)} matches multiple lockfile entries. Restore its savedQuestionSourceId manually and run sync-queries again.`,
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
          `Could not resolve ${queryLocation(appRoot, query)}: ${errorMessage(error)}`,
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
      try {
        cardsById.set(id, await client.getCard(id));
      } catch (error) {
        if (!(error instanceof MetabaseApiError) || error.status !== 404) {
          throw error;
        }
        cardsById.set(id, null);
      }
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
    const isLockfileProven = entries.some(
      ({ savedQuestionSourceId }) => savedQuestionSourceId === id,
    );
    if (isLockfileProven) {
      if (card && card.type !== "question") {
        throw new Error(`Card ${id} is no longer a saved question.`);
      }
      continue;
    }
    if (
      !card ||
      card.type !== "question" ||
      card.collection_id !== collectionId
    ) {
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
  entries: QueryLockEntry[],
  repairs: Array<{ query: DiscoveredQuery; id: number }>,
) {
  const repairedIds = new Set<number>();
  for (const { query, id } of repairs) {
    entries.push(lockEntry(query, id));
    writeQueryLockfile(appRoot, entries);
    repairedIds.add(id);
  }
  return repairedIds;
}

function queriesMatch(card: QueryCard, resolved: ResolvedQuery["resolved"]) {
  return (
    canonicalJson(stripGeneratedQueryIds(card.dataset_query)) ===
    canonicalJson(stripGeneratedQueryIds(resolved.dataset_query))
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
  const { appRoot, collectionId, client, entries, recoveredIds, cardsById } =
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
    injectSavedQuestionId(query, created.id);
    replaceLockEntry(entries, previousId, lockEntry(query, created.id));
    writeQueryLockfile(appRoot, entries);
    context.log(
      previousId
        ? `recreated: card ${previousId} -> card ${created.id}`
        : `created: ${query.exportName} -> card ${created.id}`,
    );
    return created.id;
  }

  if (recoveredId) {
    injectSavedQuestionId(query, recoveredId);
  }
  const existingEntry = entries.find(
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
    !queriesMatch(card, resolved);
  if (needsUpdate) {
    await client.updateCard(card.id, authoritative);
  }
  logExistingCardOutcome(context, query, card, existingEntry, needsUpdate);
  replaceLockEntry(entries, card.id, lockEntry(query, card.id));
  writeQueryLockfile(appRoot, entries);
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
  entries: QueryLockEntry[],
  id: number,
) {
  const index = entries.findIndex(
    ({ savedQuestionSourceId }) => savedQuestionSourceId === id,
  );
  if (index >= 0) {
    entries.splice(index, 1);
    writeQueryLockfile(appRoot, entries);
  }
}

async function reconcileRemovedQueries(
  context: ReconciliationContext,
  previousEntries: QueryLockEntry[],
  liveIds: Set<number>,
) {
  const { appRoot, collectionId, client, entries, log } = context;
  for (const entry of previousEntries) {
    if (liveIds.has(entry.savedQuestionSourceId)) {
      continue;
    }
    let card;
    try {
      card = await client.getCard(entry.savedQuestionSourceId);
    } catch (error) {
      if (error instanceof MetabaseApiError && error.status === 404) {
        removeLockEntry(appRoot, entries, entry.savedQuestionSourceId);
        continue;
      }
      throw error;
    }
    if (card.type !== "question" || card.collection_id !== collectionId) {
      const recovery =
        card.type === "question"
          ? `Move card ${card.id} back to data app collection ${collectionId} or delete it manually`
          : `Change card ${card.id} back to a saved question in data app collection ${collectionId} or delete it manually`;
      throw new Error(
        `Card ${card.id} belongs to a removed query but is no longer an owned question in the data app collection, so it was left untouched. ${recovery}, then run sync-queries again.`,
      );
    }
    await client.deleteCard(card.id);
    removeLockEntry(appRoot, entries, card.id);
    log(`deleted: card ${card.id}`);
  }
}

export async function reconcileQueries({
  appRoot,
  slug,
  collectionId,
  queries,
  previousEntries,
  client,
  log,
}: ReconcileQueriesOptions) {
  const entries = [...previousEntries];
  const recoveredIds = recoverMissingQueryIds(
    appRoot,
    queries,
    previousEntries,
  );
  const resolvedQueries = await resolveQueries(appRoot, slug, queries, client);
  const cardsById = await fetchReferencedCards(queries, recoveredIds, client);
  const repairs = findLockfileRepairs(
    queries,
    recoveredIds,
    entries,
    cardsById,
    collectionId,
  );
  const repairedLockfileIds = applyLockfileRepairs(appRoot, entries, repairs);
  const context: ReconciliationContext = {
    appRoot,
    collectionId,
    client,
    entries,
    recoveredIds,
    repairedLockfileIds,
    cardsById,
    log,
  };
  const liveIds = await reconcileLiveQueries(context, resolvedQueries);
  await reconcileRemovedQueries(context, previousEntries, liveIds);

  if (!fs.existsSync(path.join(appRoot, "queries_metadata.json"))) {
    writeQueryLockfile(appRoot, entries);
  }
}
