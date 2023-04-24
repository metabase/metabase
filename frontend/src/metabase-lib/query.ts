import * as ML from "cljs/metabase.lib.js";
import type { DatabaseId, DatasetQuery } from "metabase-types/api";
import type { Clause, ColumnMetadata, MetadataProvider, Query } from "./types";

export function fromLegacyQuery(
  databaseId: DatabaseId,
  metadata: MetadataProvider,
  datasetQuery: DatasetQuery,
): Query {
  return ML.query(databaseId, metadata, datasetQuery);
}

export function toLegacyQuery(query: Query): DatasetQuery {
  return ML.legacy_query(query);
}

export function suggestedName(query: Query): string {
  return ML.suggestedName(query);
}

declare function RemoveClauseFn(query: Query, targetClause: Clause): Query;
declare function RemoveClauseFn(
  query: Query,
  stageIndex: number,
  targetClause: Clause,
): Query;

export const removeClause: typeof RemoveClauseFn = ML.remove_clause;

declare function ReplaceClauseFn(
  query: Query,
  targetClause: Clause,
  newClause: Clause | ColumnMetadata,
): Query;
declare function ReplaceClauseFn(
  query: Query,
  stageIndex: number,
  targetClause: Clause,
  newClause: Clause | ColumnMetadata,
): Query;

export const replaceClause: typeof ReplaceClauseFn = ML.replace_clause;
