import * as ML from "cljs/metabase.lib.js";
import * as ML_MetadataCalculation from "cljs/metabase.lib.metadata.calculation";
import type {
  CardId,
  CardType,
  DatabaseId,
  DatasetColumn,
  TableId,
} from "metabase-types/api";

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
  ContentTranslationFunction,
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
import type Field from "./v1/metadata/Field";
import type Metadata from "./v1/metadata/Metadata";

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
  tc?: ContentTranslationFunction,
): ColumnDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  columnGroup: ColumnGroup,
  tc?: ContentTranslationFunction,
): ColumnGroupDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  cardMetadata: CardMetadata,
  tc?: ContentTranslationFunction,
): CardDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  tableMetadata: TableMetadata,
  tc?: ContentTranslationFunction,
): TableDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  tableLike: CardMetadata | TableMetadata,
  tc?: ContentTranslationFunction,
): CardDisplayInfo | TableDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  aggregationClause: AggregationClause,
  tc?: ContentTranslationFunction,
): AggregationClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  aggregationOperator: AggregationOperator,
  tc?: ContentTranslationFunction,
): AggregationOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  breakoutClause: BreakoutClause,
  tc?: ContentTranslationFunction,
): BreakoutClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  orderByClause: OrderByClause,
  tc?: ContentTranslationFunction,
): OrderByClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  clause: Clause,
  tc?: ContentTranslationFunction,
): ClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  bucket: Bucket,
  tc?: ContentTranslationFunction,
): BucketDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  metric: MetricMetadata,
  tc?: ContentTranslationFunction,
): MetricDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  joinStrategy: JoinStrategy,
  tc?: ContentTranslationFunction,
): JoinStrategyDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  joinConditionOperator: JoinConditionOperator,
  tc?: ContentTranslationFunction,
): JoinConditionOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru,
  tc?: ContentTranslationFunction,
): DrillThruDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  filterOperator: FilterOperator,
  tc?: ContentTranslationFunction,
): FilterOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  segment: SegmentMetadata,
  tc?: ContentTranslationFunction,
): SegmentDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
  tc?: ContentTranslationFunction,
): ColumnExtractionInfo;

// x can be any sort of opaque object, e.g. a clause or metadata map. Values returned depend on what you pass in, but it
// should always have display_name... see :metabase.lib.metadata.calculation/display-info schema
export const displayInfo: typeof DisplayInfoFn = (...args) => {
  const info = ML.display_info(...args);

  const tc = args[3];
  if (typeof tc === "function") {
    return {
      ...info,
      displayName: tc(info.displayName),
      longDisplayName: tc(info.longDisplayName),
    };
  }
  return info;
};

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

export function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.column_metadata_QMARK_(arg);
}

export function isMetricMetadata(arg: unknown): arg is MetricMetadata {
  return ML.metric_metadata_QMARK_(arg);
}

export function isSegmentMetadata(arg: unknown): arg is SegmentMetadata {
  return ML.segment_metadata_QMARK_(arg);
}
