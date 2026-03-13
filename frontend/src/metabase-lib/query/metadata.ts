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

import type Field from "../v1/metadata/Field";
import type Metadata from "../v1/metadata/Metadata";

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
  FilterOperatorDisplayInfo,
  FilterOperatorMetadata,
  JoinStrategy,
  JoinStrategyDisplayInfo,
  MeasureDisplayInfo,
  MeasureMetadata,
  MetadataProvider,
  MetricDisplayInfo,
  MetricMetadata,
  OrderByClause,
  OrderByClauseDisplayInfo,
  Query,
  QueryDisplayInfo,
  SegmentDisplayInfo,
  SegmentMetadata,
  TableDisplayInfo,
  TableMetadata,
} from "./types";

export function metadataProvider(
  databaseId: DatabaseId | null,
  metadata: Metadata,
): MetadataProvider {
  const provider = ML.metadataProvider(databaseId, metadata);
  if (!isMetadataProvider(provider)) {
    throw new TypeError(
      "Expected metadataProvider to return an opaque provider",
    );
  }
  return provider;
}

function isMetadataProvider(provider: unknown): provider is MetadataProvider {
  return typeof provider === "object" && provider != null;
}

function isColumnGroup(value: unknown): value is ColumnGroup {
  return (
    typeof value === "object" &&
    value != null &&
    "type" in value &&
    value.type === "column-group" &&
    "columns" in value &&
    Array.isArray(value.columns)
  );
}

function isColumnGroupArray(value: unknown): value is ColumnGroup[] {
  return Array.isArray(value) && value.every(isColumnGroup);
}

export function displayInfo(
  query: Query,
  stageIndex: number,
  columnMetadata: ColumnMetadata,
): ColumnDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  columnGroup: ColumnGroup,
): ColumnGroupDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  cardMetadata: CardMetadata,
): CardDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  tableMetadata: TableMetadata,
): TableDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  tableLike: CardMetadata | TableMetadata,
): CardDisplayInfo | TableDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  aggregationClause: AggregationClause,
): AggregationClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  aggregationOperator: AggregationOperator,
): AggregationOperatorDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  breakoutClause: BreakoutClause,
): BreakoutClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  orderByClause: OrderByClause,
): OrderByClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  clause: Clause,
): ClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  bucket: Bucket,
): BucketDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  metric: MetricMetadata,
): MetricDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  measure: MeasureMetadata,
): MeasureDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  joinStrategy: JoinStrategy,
): JoinStrategyDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru,
): DrillThruDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  filterOperator: FilterOperatorMetadata,
): FilterOperatorDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  segment: SegmentMetadata,
): SegmentDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
): ColumnExtractionInfo;

// x can be any sort of opaque object, e.g. a clause or metadata map. Values returned depend on what you pass in, but it
// should always have display_name... see :metabase.lib.metadata.calculation/display-info schema
export function displayInfo(
  query: Query,
  stageIndex: number,
  x: unknown,
): unknown {
  return ML.display_info(query, stageIndex, x);
}

export function groupColumns(columns: ColumnMetadata[]): ColumnGroup[] {
  const columnGroups = ML.group_columns(columns);
  if (!isColumnGroupArray(columnGroups)) {
    throw new TypeError("Expected group_columns to return column groups");
  }
  return columnGroups;
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
  return ML.visible_columns(query, stageIndex) || [];
}

export function returnedColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.returned_columns(query, stageIndex) || [];
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
  return ML.display_info(query, -1, query) as QueryDisplayInfo;
}

export function dependentMetadata(
  query: Query,
  cardId: CardId | undefined,
  cardType: CardType,
): DependentItem[] {
  return ML.dependent_metadata(query, cardId, cardType) as DependentItem[];
}

export function tableOrCardDependentMetadata(
  metadataProvider: MetadataProvider,
  tableId: TableId,
): DependentItem[] {
  return ML.table_or_card_dependent_metadata(
    metadataProvider,
    tableId,
  ) as DependentItem[];
}

export function columnKey(column: ColumnMetadata): string | null {
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
