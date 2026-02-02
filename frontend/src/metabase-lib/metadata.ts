import * as ML from "cljs/metabase.lib.js";
import type {
  Field as ApiField,
  CardId,
  CardType,
  DatabaseId,
  DatasetColumn,
  FieldId,
  TableId,
} from "metabase-types/api";

import type { ProjectionConfigDisplayInfo } from "./projection-config";
import type {
  AggregationClause,
  AggregationClauseDisplayInfo,
  AggregationOperator,
  AggregationOperatorDisplayInfo,
  BreakoutClause,
  BreakoutClauseDisplayInfo,
  Bucket,
  BucketDisplayInfo,
  CardDisplayInfo,
  CardMetadata,
  Clause,
  ClauseDisplayInfo,
  ColumnDisplayInfo,
  ColumnExtraction,
  ColumnExtractionInfo,
  ColumnGroup,
  ColumnGroupDisplayInfo,
  ColumnMetadata,
  DependentItem,
  DrillThru,
  DrillThruDisplayInfo,
  FilterOperator,
  FilterOperatorDisplayInfo,
  JoinStrategy,
  JoinStrategyDisplayInfo,
  MeasureDisplayInfo,
  MeasureMetadata,
  MetadataProvider,
  MetricDisplayInfo,
  MetricMetadata,
  OrderByClause,
  OrderByClauseDisplayInfo,
  ProjectionConfig,
  Query,
  QueryDisplayInfo,
  SegmentDisplayInfo,
  SegmentMetadata,
  TableDisplayInfo,
  TableMetadata,
} from "./types";
import type Field from "./v1/metadata/Field";
import type Metadata from "./v1/metadata/Metadata";

export function metadataProvider(
  databaseId: DatabaseId | null,
  metadata: Metadata,
): MetadataProvider {
  return ML.metadataProvider(databaseId, metadata);
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
  measure: MeasureMetadata,
): MeasureDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  joinStrategy: JoinStrategy,
): JoinStrategyDisplayInfo;
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
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
): ColumnExtractionInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  projectionConfig: ProjectionConfig,
): ProjectionConfigDisplayInfo;

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
): CardMetadata | TableMetadata | null {
  return ML.table_or_card_metadata(queryOrMetadataProvider, tableID);
}

export function fieldMetadata(
  queryOrMetadataProvider: Query | MetadataProvider,
  fieldID: FieldId,
): ColumnMetadata | null {
  return ML.field_metadata(queryOrMetadataProvider, fieldID);
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
  columnOrField: DatasetColumn | Field | ApiField,
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

export function dependentMetadata(
  query: Query,
  cardId: CardId | undefined,
  cardType: CardType,
): DependentItem[] {
  return ML.dependent_metadata(query, cardId, cardType);
}

export function tableOrCardDependentMetadata(
  metadataProvider: MetadataProvider,
  tableId: TableId,
): DependentItem[] {
  return ML.table_or_card_dependent_metadata(metadataProvider, tableId);
}

export function columnKey(column: ColumnMetadata): string {
  return ML.column_key(column);
}

export function columnUniqueKey(column: ColumnMetadata): string {
  return ML.column_unique_key(column);
}

export function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.column_metadata_QMARK_(arg);
}

export function isMetricMetadata(arg: unknown): arg is MetricMetadata {
  return ML.metric_metadata_QMARK_(arg);
}

export function isSegmentMetadata(arg: unknown): arg is SegmentMetadata {
  return ML.segment_metadata_QMARK_(arg);
}
