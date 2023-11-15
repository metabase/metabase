import * as ML from "cljs/metabase.lib.js";
import type { DatabaseId, DatasetQuery, TableId } from "metabase-types/api";
import type {
  Clause,
  ColumnMetadata,
  Join,
  MetadataProvider,
  MetricMetadata,
  Query,
  SegmentMetadata,
} from "./types";
import type LegacyMetadata from "./metadata/Metadata";

export function fromLegacyQuery(
  databaseId: DatabaseId,
  metadata: MetadataProvider | LegacyMetadata,
  datasetQuery: DatasetQuery,
): Query {
  return ML.query(databaseId, metadata, datasetQuery);
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

export function appendStage(query: Query): Query {
  return ML.append_stage(query);
}

export function dropStage(query: Query, stageIndex: number): Query {
  return ML.drop_stage(query, stageIndex);
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
