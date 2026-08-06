import fs from "node:fs";
import path from "node:path";

import { canonicalJson, stripGeneratedQueryIds } from "./canonical";
import { discoverQueries, injectSavedQuestionId } from "./discover";
import { readQueryLockfile, writeQueryLockfile } from "./lockfile";
import { MetabaseApiError, MetabaseClient } from "./metabase-client";
import type { DiscoveredQuery, QueryLockEntry } from "./types";

export interface SyncQueriesOptions {
  appRoot: string;
  metabaseUrl: string;
  apiKey: string;
  log?: (message: string) => void;
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
  const entries = [...previousEntries];
  const client = new MetabaseClient(metabaseUrl, apiKey);
  const slug = path.basename(appRoot);
  const app = await client.prepareQuerySync(slug);
  if (!isPositiveInteger(app.resource_collection_id)) {
    throw new Error(`Data app ${slug} does not have a resource collection.`);
  }

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

  const savedQuestionId = (query: DiscoveredQuery) =>
    query.savedQuestionSourceId ?? recoveredIds.get(query);

  const resolvedQueries = await Promise.all(
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
  const cardsById = new Map<
    number,
    Awaited<ReturnType<typeof client.getCard>> | null
  >();
  await Promise.all(
    queries.map(async (query) => {
      const id = savedQuestionId(query);
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
  const lockfileRepairs: Array<{ query: DiscoveredQuery; id: number }> = [];
  for (const query of queries) {
    const id = savedQuestionId(query);
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
      card.collection_id !== app.resource_collection_id
    ) {
      throw new Error(
        `${query.exportName} references card ${id}, but the lockfile does not prove ownership and the card cannot be safely adopted.`,
      );
    }
    lockfileRepairs.push({ query, id });
  }
  const repairedLockfileIds = new Set<number>();
  for (const { query, id } of lockfileRepairs) {
    entries.push(lockEntry(query, id));
    writeQueryLockfile(appRoot, entries);
    repairedLockfileIds.add(id);
  }

  const liveIds = new Set<number>();
  for (const { query, resolved } of resolvedQueries) {
    const authoritative = {
      name: query.exportName,
      collectionId: app.resource_collection_id,
      datasetQuery: resolved.dataset_query,
    };
    const recoveredId = recoveredIds.get(query);
    const previousId = savedQuestionId(query);
    let id = previousId;
    const card = id ? cardsById.get(id) : null;

    if (!card) {
      const created = await client.createCard(authoritative);
      if (!isPositiveInteger(created.id)) {
        throw new Error(
          "The Card API did not return a valid saved question ID.",
        );
      }
      id = created.id;
      injectSavedQuestionId(query, id);
      replaceLockEntry(entries, previousId, lockEntry(query, id));
      writeQueryLockfile(appRoot, entries);
      log(
        previousId
          ? `recreated: card ${previousId} -> card ${id}`
          : `created: ${query.exportName} -> card ${id}`,
      );
    } else {
      id = card.id;
      if (recoveredId) {
        injectSavedQuestionId(query, recoveredId);
      }
      const existingEntry = entries.find(
        ({ savedQuestionSourceId }) => savedQuestionSourceId === id,
      );
      if (!existingEntry) {
        throw new Error(
          `${query.exportName} references card ${id}, but the lockfile does not prove ownership.`,
        );
      }
      if (card.type !== "question") {
        throw new Error(`Card ${id} is no longer a saved question.`);
      }
      const queryMatches =
        canonicalJson(stripGeneratedQueryIds(card.dataset_query)) ===
        canonicalJson(stripGeneratedQueryIds(resolved.dataset_query));
      const needsUpdate =
        card.name !== query.exportName ||
        card.collection_id !== app.resource_collection_id ||
        !queryMatches;
      if (needsUpdate) {
        await client.updateCard(id, authoritative);
        const authoredChanged =
          existingEntry.tableId !== query.tableId ||
          existingEntry.hash !== query.hash;
        const action =
          authoredChanged || card.name !== query.exportName
            ? "updated"
            : "restored";
        const checkpoint = recoveredId
          ? "restored source ID, "
          : repairedLockfileIds.has(id)
            ? "repaired lockfile, "
            : "";
        log(`${checkpoint}${action}: card ${id}`);
      } else if (recoveredId) {
        log(`restored source ID: ${query.exportName} -> card ${id}`);
      } else if (repairedLockfileIds.has(id)) {
        log(`repaired lockfile: ${query.exportName} -> card ${id}`);
      } else {
        log(`unchanged: card ${id}`);
      }
      replaceLockEntry(entries, id, lockEntry(query, id));
      writeQueryLockfile(appRoot, entries);
    }
    liveIds.add(id);
  }

  for (const entry of previousEntries) {
    if (liveIds.has(entry.savedQuestionSourceId)) {
      continue;
    }
    let card;
    try {
      card = await client.getCard(entry.savedQuestionSourceId);
    } catch (error) {
      if (error instanceof MetabaseApiError && error.status === 404) {
        const index = entries.findIndex(
          ({ savedQuestionSourceId }) =>
            savedQuestionSourceId === entry.savedQuestionSourceId,
        );
        if (index >= 0) {
          entries.splice(index, 1);
          writeQueryLockfile(appRoot, entries);
        }
        continue;
      }
      throw error;
    }
    if (
      card.type !== "question" ||
      card.collection_id !== app.resource_collection_id
    ) {
      const recovery =
        card.type === "question"
          ? `Move card ${card.id} back to data app collection ${app.resource_collection_id} or delete it manually`
          : `Change card ${card.id} back to a saved question in data app collection ${app.resource_collection_id} or delete it manually`;
      throw new Error(
        `Card ${card.id} belongs to a removed query but is no longer an owned question in the data app collection, so it was left untouched. ${recovery}, then run sync-queries again.`,
      );
    }
    await client.deleteCard(card.id);
    const index = entries.findIndex(
      ({ savedQuestionSourceId }) => savedQuestionSourceId === card.id,
    );
    entries.splice(index, 1);
    writeQueryLockfile(appRoot, entries);
    log(`deleted: card ${card.id}`);
  }

  if (!fs.existsSync(path.join(appRoot, "queries_metadata.json"))) {
    writeQueryLockfile(appRoot, entries);
  }
}
