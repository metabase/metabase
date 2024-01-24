import * as ML from "cljs/metabase.lib.js";
import type { DatabaseId, DatasetQuery, TableId } from "metabase-types/api";
import type LegacyMetadata from "./metadata/Metadata";
import type {
  CardMetadata,
  Clause,
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
  metadata: MetadataProvider | LegacyMetadata,
  datasetQuery: DatasetQuery,
): Query {
  return ML.query(databaseId, metadata, datasetQuery);
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

export function dropStage(query: Query, stageIndex: number): Query {
  return ML.drop_stage(query, stageIndex);
}

export function dropStageIfEmpty(query: Query, stageIndex: number): Query {
  return ML.drop_stage_if_empty(query, stageIndex);
}

export function dropEmptyStages(query: Query): Query {
  const stageIndexes = Array.from({ length: stageCount(query) }).map(
    (_, index) => index,
  );

  return stageIndexes.reduceRight((query, stageIndex) => {
    return dropStageIfEmpty(query, stageIndex);
  }, query);
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
  newClause: Clause | ColumnMetadata | MetricMetadata | SegmentMetadata | Join,
): Query {
  return ML.replace_clause(query, stageIndex, targetClause, newClause);
}

export function sourceTableOrCardId(query: Query): TableId | null {
  return ML.source_table_or_card_id(query);
}
