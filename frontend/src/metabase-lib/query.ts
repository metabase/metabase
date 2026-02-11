import * as ML from "cljs/metabase.lib.js";
import { metadataProvider } from "metabase-lib/metadata";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  CardId,
  CardType,
  DatasetQuery,
  LegacyDatasetQuery,
  OpaqueDatasetQuery,
  TableId,
  TestQuerySpec,
} from "metabase-types/api";

import type {
  CardMetadata,
  Clause,
  ClauseType,
  ColumnMetadata,
  Join,
  MeasureMetadata,
  MetadataProvider,
  MetricMetadata,
  Query,
  SegmentMetadata,
  TableMetadata,
} from "./types";

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

export function toLegacyQuery(query: Query): LegacyDatasetQuery {
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

export function stageIndexes(query: Query): number[] {
  return Array.from(
    { length: stageCount(query) },
    (_, stageIndex) => stageIndex,
  );
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

export function ensureFilterStage(query: Query): Query {
  return ML.ensure_filter_stage(query);
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
    | MeasureMetadata
    | MetricMetadata
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

export function canRun(query: Query, cardType: CardType): boolean {
  return ML.can_run(query, cardType);
}

export function canSave(query: Query, cardType: CardType): boolean {
  return ML.can_save(query, cardType);
}

export function asReturned(
  query: Query,
  stageIndex: number,
  cardId: CardId | undefined,
): { query: Query; stageIndex: number } {
  return ML.as_returned(query, stageIndex, cardId);
}

export function previewQuery(
  query: Query,
  stageIndex: number,
  clauseType: ClauseType,
  clauseIndex: number | null,
): Query | null {
  return ML.preview_query(query, stageIndex, clauseType, clauseIndex);
}

export function fromJsQuery(
  metadataProvider: MetadataProvider,
  jsQuery: OpaqueDatasetQuery | DatasetQuery,
): Query {
  return ML.from_js_query(metadataProvider, jsQuery);
}

export function fromJsQueryAndMetadata(
  metadata: Metadata,
  jsQuery: OpaqueDatasetQuery | DatasetQuery,
): Query {
  return fromJsQuery(metadataProvider(jsQuery.database, metadata), jsQuery);
}

export function toJsQuery(query: Query): OpaqueDatasetQuery {
  return ML.to_js_query(query);
}

export function createTestQuery(
  metadataProvider: MetadataProvider,
  querySpec: TestQuerySpec,
): Query {
  return ML.test_query(metadataProvider, querySpec);
}
