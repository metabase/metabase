import * as ML from "cljs/metabase.lib.js";
import * as ML_MetadataCalculation from "cljs/metabase.lib.metadata.calculation";
import type { DatabaseId } from "metabase-types/api";
import type Metadata from "./metadata/Metadata";
import type {
  AggregationClause,
  AggregationClauseDisplayInfo,
  AggregationOperator,
  AggregationOperatorDisplayInfo,
  BreakoutClause,
  BreakoutClauseDisplayInfo,
  Bucket,
  BucketDisplayInfo,
  Clause,
  ClauseDisplayInfo,
  ColumnDisplayInfo,
  ColumnGroup,
  ColumnMetadata,
  FilterOperator,
  FilterOperatorDisplayInfo,
  JoinStrategy,
  JoinStrategyDisplayInfo,
  MetadataProvider,
  MetricMetadata,
  MetricDisplayInfo,
  OrderByClause,
  OrderByClauseDisplayInfo,
  TableDisplayInfo,
  Query,
} from "./types";

export function metadataProvider(
  databaseId: DatabaseId,
  metadata: Metadata,
): MetadataProvider {
  return ML.metadataProvider(databaseId, metadata);
}

export function displayName(query: Query, clause: Clause): string {
  return ML_MetadataCalculation.display_name(query, clause);
}

declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  columnMetadata: ColumnMetadata,
): ColumnDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  columnGroup: ColumnGroup,
): ColumnDisplayInfo | TableDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  aggregationClause: AggregationClause,
): AggregationClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  aggregationOperator: AggregationOperator,
): AggregationOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  breakoutClause: BreakoutClause,
): BreakoutClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  orderByClause: OrderByClause,
): OrderByClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  clause: Clause,
): ClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  bucket: Bucket,
): BucketDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  metric: MetricMetadata,
): MetricDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  joinStrategy: JoinStrategy,
): JoinStrategyDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  filterOperator: FilterOperator,
): FilterOperatorDisplayInfo;

// x can be any sort of opaque object, e.g. a clause or metadata map. Values returned depend on what you pass in, but it
// should always have display_name... see :metabase.lib.metadata.calculation/display-info schema
export const displayInfo: typeof DisplayInfoFn = ML.display_info;

export function groupColumns(columns: ColumnMetadata[]): ColumnGroup[] {
  return ML.group_columns(columns);
}

export function getColumnsFromColumnGroup(
  group: ColumnGroup,
): ColumnMetadata[] {
  return ML.columns_group_columns(group);
}

export function describeTemporalUnit(
  unit: string | null = null,
  n: number = 1,
): string {
  return ML.describe_temporal_unit(n, unit);
}

type IntervalAmount = number | "current" | "next" | "last";

export function describeTemporalInterval(
  n: IntervalAmount,
  unit?: string,
): string {
  return ML.describe_temporal_interval(n, unit);
}

export function describeRelativeDatetime(
  n: IntervalAmount,
  unit?: string,
): string {
  return ML.describe_relative_datetime(n, unit);
}
