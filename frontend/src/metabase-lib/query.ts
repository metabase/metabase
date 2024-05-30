import * as ML from "cljs/metabase.lib.js";
import type { DatabaseId, DatasetQuery, TableId } from "metabase-types/api";

import type {
  CardMetadata,
  Clause,
  ClauseType,
  ColumnMetadata,
  Join,
  MetadataProvider,
  LegacyMetricMetadata,
  Query,
  SegmentMetadata,
  TableMetadata,
} from "./types";

export function fromLegacyQuery(
  databaseId: DatabaseId | null,
  metadataProvider: MetadataProvider,
  datasetQuery: DatasetQuery,
): Query {
  return ML.query(databaseId, metadataProvider, datasetQuery);
}

/**
 * Use this in combination with Lib.metadataProvider(databaseId, legacyMetadata) and
 Lib.tableOrCardMetadata(metadataProvider, tableOrCardId);
 */
export function queryFromTableOrCardMetadata(
  metadataProvider: MetadataProvider,
  tableOrCardMetadata: TableMetadata | CardMetadata,
): Query {
  return ML.query(metadataProvider, tableOrCardMetadata);
}

export function toLegacyQuery(query: Query): DatasetQuery {
  return ML.legacy_query(query);
}

export function withDifferentTable(query: Query, tableId: TableId): Query {
  return ML.with_different_table(query, tableId);
}

export function suggestedName(query: Query): string {
  return ML.suggestedName(query);
}

export function stageCount(query: Query): number {
  return ML.stage_count(query);
}

export const hasClauses = (query: Query, stageIndex: number): boolean => {
  return ML.has_clauses(query, stageIndex);
};

export function appendStage(query: Query): Query {
  return ML.append_stage(query);
}

export function dropStage(query: Query): Query {
  return ML.drop_stage(query);
}

export function dropEmptyStages(query: Query): Query {
  return ML.drop_empty_stages(query);
}

export function removeClause(
  query: Query,
  stageIndex: number,
  targetClause: Clause | Join,
): Query {
  return ML.remove_clause(query, stageIndex, targetClause);
}

export function replaceClause(
  query: Query,
  stageIndex: number,
  targetClause: Clause | Join,
  newClause:
    | Clause
    | ColumnMetadata
    | LegacyMetricMetadata
    | SegmentMetadata
    | Join,
): Query {
  return ML.replace_clause(query, stageIndex, targetClause, newClause);
}

export function swapClauses(
  query: Query,
  stageIndex: number,
  sourceClause: Clause,
  targetClause: Clause,
): Query {
  return ML.swap_clauses(query, stageIndex, sourceClause, targetClause);
}

export function sourceTableOrCardId(query: Query): TableId | null {
  return ML.source_table_or_card_id(query);
}

export function canRun(query: Query): boolean {
  return ML.can_run(query);
}

export function canSave(query: Query): boolean {
  return ML.can_save(query);
}

export function asReturned(
  query: Query,
  stageIndex: number,
): { query: Query; stageIndex: number } {
  return ML.as_returned(query, stageIndex);
}

export function previewQuery(
  query: Query,
  stageIndex: number,
  clauseType: ClauseType,
  clauseIndex: number | null,
): Query | null {
  return ML.preview_query(query, stageIndex, clauseType, clauseIndex);
}
