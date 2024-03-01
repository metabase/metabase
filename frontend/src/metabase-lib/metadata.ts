import * as ML from "cljs/metabase.lib.js";
import * as ML_MetadataCalculation from "cljs/metabase.lib.metadata.calculation";
import type { DatabaseId, DatasetColumn, TableId } from "metabase-types/api";

import type Field from "./metadata/Field";
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
  CardMetadata,
  CardDisplayInfo,
  Clause,
  ClauseDisplayInfo,
  ColumnDisplayInfo,
  ColumnGroup,
  ColumnGroupDisplayInfo,
  ColumnMetadata,
  DependentItem,
  DrillThru,
  DrillThruDisplayInfo,
  FilterOperator,
  FilterOperatorDisplayInfo,
  JoinConditionOperator,
  JoinConditionOperatorDisplayInfo,
  JoinStrategy,
  JoinStrategyDisplayInfo,
  MetadataProvider,
  MetricMetadata,
  MetricDisplayInfo,
  OrderByClause,
  OrderByClauseDisplayInfo,
  Query,
  SegmentMetadata,
  SegmentDisplayInfo,
  TableDisplayInfo,
  TableMetadata,
  QueryDisplayInfo,
} from "./types";

export function metadataProvider(
  databaseId: DatabaseId | null,
  metadata: Metadata,
): MetadataProvider {
  return ML.metadataProvider(databaseId, metadata);
}

/**
 * @deprecated use displayInfo instead
 */
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
): ColumnGroupDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  cardMetadata: CardMetadata,
): CardDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  tableMetadata: TableMetadata,
): TableDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  tableLike: CardMetadata | TableMetadata,
): CardDisplayInfo | TableDisplayInfo;
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
  joinConditionOperator: JoinConditionOperator,
): JoinConditionOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru,
): DrillThruDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  filterOperator: FilterOperator,
): FilterOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  segment: SegmentMetadata,
): SegmentDisplayInfo;

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

export function tableOrCardMetadata(
  queryOrMetadataProvider: Query | MetadataProvider,
  tableID: TableId,
): CardMetadata | TableMetadata {
  return ML.table_or_card_metadata(queryOrMetadataProvider, tableID);
}

export function visibleColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.visible_columns(query, stageIndex);
}

export function returnedColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.returned_columns(query, stageIndex);
}

export function fromLegacyColumn(
  query: Query,
  stageIndex: number,
  columnOrField: DatasetColumn | Field,
): ColumnMetadata {
  return ML.legacy_column__GT_metadata(query, stageIndex, columnOrField);
}

export function queryDisplayInfo(query: Query): QueryDisplayInfo {
  /**
   * Even though it seems weird to pass the same query two times,
   * this function follows the same pattern as the other display_info overloads.
   * The first two parameters are always a query, and a stage index.
   * The third parameter is what you would like to have the info about.
   * It just only happens that the thing we're examining is (again) the query itself.
   */
  return ML.display_info(query, -1, query);
}

export function dependentMetadata(query: Query): DependentItem[] {
  return ML.dependent_metadata(query);
}
