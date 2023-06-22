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

export function appendStage(query: Query): Query {
  return ML.append_stage(query);
}

export function dropStage(query: Query, stageIndex: number): Query {
  return ML.drop_stage(query, stageIndex);
}

export function removeClause(
  query: Query,
  stageIndex: number,
  targetClause: Clause,
): Query {
  return ML.remove_clause(query, stageIndex, targetClause);
}

export function replaceClause(
  query: Query,
  stageIndex: number,
  targetClause: Clause,
  newClause: Clause | ColumnMetadata,
): Query {
  return ML.replace_clause(query, stageIndex, targetClause, newClause);
}
