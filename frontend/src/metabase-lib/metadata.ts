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
import { TCFunc } from "metabase/i18n/components/ContentTranslationContext";

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
  tc?: TCFunc,
): ColumnDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  columnGroup: ColumnGroup,
  tc?: TCFunc,
): ColumnGroupDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  cardMetadata: CardMetadata,
  tc?: TCFunc,
): CardDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  tableMetadata: TableMetadata,
  tc?: TCFunc,
): TableDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  tableLike: CardMetadata | TableMetadata,
  tc?: TCFunc,
): CardDisplayInfo | TableDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  aggregationClause: AggregationClause,
  tc?: TCFunc,
): AggregationClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  aggregationOperator: AggregationOperator,
  tc?: TCFunc,
): AggregationOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  breakoutClause: BreakoutClause,
  tc?: TCFunc,
): BreakoutClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  orderByClause: OrderByClause,
  tc?: TCFunc,
): OrderByClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  clause: Clause,
  tc?: TCFunc,
): ClauseDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  bucket: Bucket,
  tc?: TCFunc,
): BucketDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  metric: MetricMetadata,
  tc?: TCFunc,
): MetricDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  joinStrategy: JoinStrategy,
  tc?: TCFunc,
): JoinStrategyDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  joinConditionOperator: JoinConditionOperator,
  tc?: TCFunc,
): JoinConditionOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  drillThru: DrillThru,
  tc?: TCFunc,
): DrillThruDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  filterOperator: FilterOperator,
  tc?: TCFunc,
): FilterOperatorDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  segment: SegmentMetadata,
  tc?: TCFunc,
): SegmentDisplayInfo;
declare function DisplayInfoFn(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
  tc?: TCFunc,
): ColumnExtractionInfo;

// x can be any sort of opaque object, e.g. a clause or metadata map. Values returned depend on what you pass in, but it
// should always have display_name... see :metabase.lib.metadata.calculation/display-info schema
export const displayInfo: typeof DisplayInfoFn = (...args) => {
  console.log("displayInfo called with args", args);

  const info = ML.display_info(...args, { "Artist Name": "ARTIST NAME!" });
  console.log("@m932ynrk", "args", args);

  const cache: any = [];
  // Stringify with circularity avoidance
  const stringifiedArgs = JSON.stringify(args, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (cache.includes(value)) {
        return;
      }
      cache.push(value);
    }
    return value;
  });

  // if (stringifiedArgs.includes("Artist")) {
  //   debugger;
  // }

  if (args.length === 4 && typeof args[3] === "function") {
    const tc = args[3] as TCFunc;
    return {
      ...info,
      ...(info.displayName
        ? {
            displayName: tc(info.displayName),
          }
        : {}),
      ...(info.longDisplayName
        ? {
            longDisplayName: tc(info.longDisplayName),
          }
        : {}),
    };
  }
  return info;
};

export function groupColumns(columns: ColumnMetadata[]): ColumnGroup[] {
  return ML.group_columns(columns);
}

const hasDisplayNames = (
  arr: ColumnMetadata[],
): arr is ColumnMetadataWithDisplayName[] => {
  return "displayName" in arr[0];
};

type ColumnMetadataWithDisplayName = ColumnMetadata & {
  displayName: string;
};

// FIXME: translation may not be needed here. i'm not sure this has display names in it
export function getColumnsFromColumnGroup(
  group: ColumnGroup,
  tc?: TCFunc,
): ColumnMetadata[] {
  const columns: ColumnMetadata[] = ML.columns_group_columns(group);
  if (tc && hasDisplayNames(columns)) {
    return columns
      .map((col) => ({
        ...col,
        displayName: tc(col.displayName),
      }))
      .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return columns;
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
