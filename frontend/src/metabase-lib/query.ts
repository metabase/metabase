import {
  append_stage,
  as_returned,
  can_run,
  can_save,
  suggestedName as cljs_suggestedName,
  drop_empty_stages,
  drop_stage,
  ensure_filter_stage,
  has_clauses,
  legacy_query,
  preview_query,
  query,
  random_ident,
  remove_clause,
  replace_clause,
  source_table_or_card_id,
  stage_count,
  swap_clauses,
  with_different_table,
} from "cljs/metabase.lib.js";
import type {
  CardId,
  CardType,
  DatabaseId,
  DatasetQuery,
  TableId,
} from "metabase-types/api";

import type {
  CardMetadata,
  Clause,
  ClauseType,
  ColumnMetadata,
  Join,
  MetadataProvider,
  MetricMetadata,
  Query,
  SegmentMetadata,
  TableMetadata,
} from "./types";

export function fromLegacyQuery(
  databaseId: DatabaseId | null,
  metadataProvider: MetadataProvider,
  datasetQuery: DatasetQuery,
): Query {
  return query(databaseId, metadataProvider, datasetQuery);
}

// Returns a NanoID string for a card and query to use.
export function randomIdent(): string {
  return random_ident();
}

/**
 * Use this in combination with Lib.metadataProvider(databaseId, legacyMetadata) and
 Lib.tableOrCardMetadata(metadataProvider, tableOrCardId);
 */
export function queryFromTableOrCardMetadata(
  metadataProvider: MetadataProvider,
  tableOrCardMetadata: TableMetadata | CardMetadata,
): Query {
  return query(metadataProvider, tableOrCardMetadata);
}

export function toLegacyQuery(query: Query): DatasetQuery {
  return legacy_query(query);
}

export function withDifferentTable(query: Query, tableId: TableId): Query {
  return with_different_table(query, tableId);
}

export function suggestedName(query: Query): string {
  return cljs_suggestedName(query);
}

export function stageCount(query: Query): number {
  return stage_count(query);
}

export function stageIndexes(query: Query): number[] {
  return Array.from(
    { length: stageCount(query) },
    (_, stageIndex) => stageIndex,
  );
}

export const hasClauses = (query: Query, stageIndex: number): boolean => {
  return has_clauses(query, stageIndex);
};

export function appendStage(query: Query): Query {
  return append_stage(query);
}

export function dropStage(query: Query): Query {
  return drop_stage(query);
}

export function dropEmptyStages(query: Query): Query {
  return drop_empty_stages(query);
}

export function ensureFilterStage(query: Query): Query {
  return ensure_filter_stage(query);
}

export function removeClause(
  query: Query,
  stageIndex: number,
  targetClause: Clause | Join,
): Query {
  return remove_clause(query, stageIndex, targetClause);
}

export function replaceClause(
  query: Query,
  stageIndex: number,
  targetClause: Clause | Join,
  newClause: Clause | ColumnMetadata | MetricMetadata | SegmentMetadata | Join,
): Query {
  return replace_clause(query, stageIndex, targetClause, newClause);
}

export function swapClauses(
  query: Query,
  stageIndex: number,
  sourceClause: Clause,
  targetClause: Clause,
): Query {
  return swap_clauses(query, stageIndex, sourceClause, targetClause);
}

export function sourceTableOrCardId(query: Query): TableId | null {
  return source_table_or_card_id(query);
}

export function canRun(query: Query, cardType: CardType): boolean {
  return can_run(query, cardType);
}

export function canSave(query: Query, cardType: CardType): boolean {
  return can_save(query, cardType);
}

export function asReturned(
  query: Query,
  stageIndex: number,
  cardId: CardId | undefined,
): { query: Query; stageIndex: number } {
  return as_returned(query, stageIndex, cardId);
}

export function previewQuery(
  query: Query,
  stageIndex: number,
  clauseType: ClauseType,
  clauseIndex: number | null,
): Query | null {
  return preview_query(query, stageIndex, clauseType, clauseIndex);
}
