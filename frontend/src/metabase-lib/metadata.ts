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

import type {
  AggregationClause,
  AggregationClauseDisplayInfo,
  AggregationOperator,
  AggregationOperatorDisplayInfo,
  BreakoutClause,
  BreakoutClauseDisplayInfo,
  Bucket,
  BucketDisplayInfo,
  BucketOption,
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
  // MetadataProvider is an opaque type — the CLJS function returns an opaque
  // provider object that has no structural type in TS. Cast is unavoidable.
  return ML.metadataProvider(databaseId, metadata) as MetadataProvider;
}

// displayInfo overloads — runtime type guards in the implementation
// handle return type narrowing since ColumnMetadata is poisoned by `any`
// (its generated type includes `& any` from ColumnValidateForSource).
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
  aggregationOperator: AggregationOperator,
): AggregationOperatorDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  bucket: Bucket | BucketOption,
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
  filterOperator: FilterOperator,
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
export function displayInfo(
  query: Query,
  stageIndex: number,
  orderByClause: OrderByClause,
): OrderByClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  aggregationClause: AggregationClause,
): AggregationClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  breakoutClause: BreakoutClause,
): BreakoutClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  clause: Clause,
): ClauseDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  columnMetadata: ColumnMetadata,
): ColumnDisplayInfo;
export function displayInfo(
  query: Query,
  stageIndex: number,
  opaque: unknown,
): unknown {
  const result = ML.display_info(query, stageIndex, opaque);
  // Runtime type guards to narrow the return type.
  // The `type` field on the input determines what display-info returns.
  const typ = (opaque as Record<string, unknown>)?.type;
  switch (typ) {
    case "column-group":
      return result as ColumnGroupDisplayInfo;
    case "card":
      return result as CardDisplayInfo;
    case "table":
      return result as TableDisplayInfo;
    case "aggregation":
      return result as AggregationOperatorDisplayInfo;
    case "temporal-bucketing":
      return result as BucketDisplayInfo;
    case "metric":
      return result as MetricDisplayInfo;
    case "measure":
      return result as MeasureDisplayInfo;
    case "join.strategy":
      return result as JoinStrategyDisplayInfo;
    case "drill-thru":
      return result as DrillThruDisplayInfo;
    case "filter":
      return result as FilterOperatorDisplayInfo;
    case "segment":
      return result as SegmentDisplayInfo;
    case "extraction":
      return result as ColumnExtractionInfo;
    default:
      break;
  }
  // Clauses are arrays — check first element for order-by
  if (Array.isArray(opaque)) {
    if (opaque[0] === "asc" || opaque[0] === "desc") {
      return result as OrderByClauseDisplayInfo;
    }
    return result as ClauseDisplayInfo;
  }
  // Binning buckets have `strategy` but no `type`
  if (
    typeof opaque === "object" &&
    opaque !== null &&
    "strategy" in opaque &&
    !("type" in opaque)
  ) {
    return result as BucketDisplayInfo;
  }
  // JoinStrategy plain strings
  if (typeof opaque === "string") {
    return result as JoinStrategyDisplayInfo;
  }
  return result as ColumnDisplayInfo;
}

export function groupColumns(columns: ColumnMetadata[]): ColumnGroup[] {
  // ColumnGroup schema is private in CLJS (not a registered mr/def), so the
  // generated type is Record<string, unknown>. The runtime values match ColumnGroup.
  return ML.group_columns(columns) as ColumnGroup[];
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
