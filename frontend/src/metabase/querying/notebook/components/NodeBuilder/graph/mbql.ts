// Turning pasted MBQL text into a query the canvas can take.

import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { DatabaseId, DatasetQuery } from "metabase-types/api";

import { seedGraph } from "./seed";
import { getUnsupportedReason } from "./support";

export type MbqlInput = { datasetQuery: DatasetQuery } | { error: string };

// Accepts the inner MBQL object or a full dataset query; the current
// database fills in for a missing one.
export function parseMbqlInput(
  text: string,
  currentDatabaseId: DatabaseId | null,
): MbqlInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: t`This is not valid JSON.` };
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: t`Expected an MBQL query object.` };
  }
  // Narrowed above to a plain object; the keys are checked one by one.
  const raw = parsed as Record<string, unknown>;
  if (
    raw.type === "query" &&
    raw.query != null &&
    typeof raw.query === "object"
  ) {
    const database =
      typeof raw.database === "number" ? raw.database : currentDatabaseId;
    if (database == null) {
      return { error: t`Include the database id in the dataset query.` };
    }
    // Shape checked just above.
    const datasetQuery = { ...raw, database, type: "query" } as DatasetQuery;
    return { datasetQuery };
  }
  if ("source-table" in raw || "source-query" in raw) {
    if (currentDatabaseId == null) {
      return { error: t`Paste a full dataset query with a database id.` };
    }
    // Shape checked just above.
    const datasetQuery = {
      database: currentDatabaseId,
      type: "query",
      query: raw,
    } as DatasetQuery;
    return { datasetQuery };
  }
  return {
    error: t`Expected an MBQL query: either an object with "source-table", or one with "database", "type" and "query".`,
  };
}

// Why a loaded query cannot go on the canvas, or null when it can.
export function checkLoadedQuery(query: Lib.Query): string | null {
  const sourceId = Lib.sourceTableOrCardId(query);
  if (sourceId == null || !Lib.tableOrCardMetadata(query, sourceId)) {
    return t`The source table of this query is not available.`;
  }
  const reason = getUnsupportedReason(query);
  if (reason != null) {
    return t`The canvas can't show this query yet: it has ${reason}.`;
  }
  try {
    // Throws on clauses the canvas cannot represent.
    seedGraph(query);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return t`This MBQL could not be loaded: ${detail}`;
  }
  return null;
}
