import path from "node:path";

import { injectSavedQuestionId } from "./ast/query-source";
import { getCanonicalQueryJson } from "./canonical";
import { writeQueryLockfile } from "./lockfile";
import type { MetabaseClient } from "./metabase-client";
import type { DiscoveredQuery, QueryLockEntry } from "./types";

interface ReconcileOptions {
  appRoot: string;
  slug: string;
  collectionId: number;
  queries: DiscoveredQuery[];
  previousEntries: QueryLockEntry[];
  client: MetabaseClient;
  log: (message: string) => void;
}

const withoutGeneratedId = (query: DiscoveredQuery) => {
  const authored = { ...query.query };
  delete authored.savedQuestionSourceId;
  return authored;
};

const lockEntry = (query: DiscoveredQuery, id: number): QueryLockEntry => ({
  tableId: query.tableId,
  hash: query.hash,
  savedQuestionSourceId: id,
});

export async function reconcileQueries(options: ReconcileOptions) {
  const { appRoot, slug, collectionId, queries, previousEntries, client, log } =
    options;
  const entries = [...previousEntries];
  const resolved = await Promise.all(
    queries.map(async (query) => {
      try {
        return {
          query,
          result: await client.resolveQuery(slug, withoutGeneratedId(query)),
        };
      } catch (error) {
        const location = `${path.relative(appRoot, query.filePath)}:${query.exportName}`;
        throw new Error(`Could not resolve ${location}: ${String(error)}`);
      }
    }),
  );

  for (const { query, result } of resolved) {
    const id = query.savedQuestionSourceId;
    if (!id) {
      const card = await client.createCard(
        query.exportName,
        collectionId,
        result.dataset_query,
      );
      injectSavedQuestionId(query, card.id);
      entries.push(lockEntry(query, card.id));
      writeQueryLockfile(appRoot, entries);
      log(`created: ${query.exportName} -> card ${card.id}`);
      continue;
    }

    const entry = entries.find(
      ({ savedQuestionSourceId }) => savedQuestionSourceId === id,
    );
    if (!entry) {
      throw new Error(
        `${query.exportName} references card ${id}, but the lockfile does not prove ownership.`,
      );
    }
    const card = await client.getCard(id);
    if (card.type !== "question") {
      throw new Error(`Card ${id} is no longer a saved question.`);
    }
    const changed =
      card.name !== query.exportName ||
      card.collection_id !== collectionId ||
      getCanonicalQueryJson(card.dataset_query) !==
        getCanonicalQueryJson(result.dataset_query);
    if (changed) {
      await client.updateCard(
        id,
        query.exportName,
        collectionId,
        result.dataset_query,
      );
      log(`updated: card ${id}`);
    } else {
      log(`unchanged: card ${id}`);
    }
    Object.assign(entry, lockEntry(query, id));
    writeQueryLockfile(appRoot, entries);
  }

  return [...new Set(resolved.map(({ result }) => result.database_id))].sort(
    (a, b) => a - b,
  );
}
