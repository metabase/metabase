import * as Lib from "metabase-lib";

import { getDefaultDateColumn } from "./suggestions";
import { STAGE_INDEX } from "./utils";

const MAX_DIMENSION_TABS = 7;

export type CutTab =
  | { kind: "rows"; key: string; isActive: boolean }
  | { kind: "total"; key: string; isActive: boolean }
  | {
      kind: "dimension";
      key: string;
      label: string;
      longLabel: string;
      column: Lib.ColumnMetadata;
      breakout: Lib.BreakoutClause | null;
      isActive: boolean;
    };

function isCuttableColumn(column: Lib.ColumnMetadata): boolean {
  return (
    (Lib.isTemporal(column) ||
      Lib.isCategory(column) ||
      Lib.isBoolean(column) ||
      Lib.isState(column) ||
      Lib.isCountry(column) ||
      Lib.isCity(column)) &&
    !Lib.isPrimaryKey(column) &&
    !Lib.isForeignKey(column) &&
    !Lib.isEntityName(column) &&
    !Lib.isTitle(column) &&
    !Lib.isDescription(column)
  );
}

function getBreakoutPositions(query: Lib.Query, column: Lib.ColumnMetadata) {
  return Lib.displayInfo(query, STAGE_INDEX, column).breakoutPositions ?? [];
}

/**
 * The ways to cut the current slice: its rows, a single total, or grouped by one of its
 * columns: its main date, then its categories and places, own columns before linked ones.
 * Groupings in use are always offered, in their usual place, so tabs don't move when clicked.
 */
export function getCutTabs(query: Lib.Query): CutTab[] {
  const hasAggregations = Lib.aggregations(query, STAGE_INDEX).length > 0;
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  const context = { query, stageIndex: STAGE_INDEX };

  const isUsed = (column: Lib.ColumnMetadata) =>
    getBreakoutPositions(query, column).length > 0;
  const isOwn = (column: Lib.ColumnMetadata) => {
    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    return !info.isFromJoin && !info.isImplicitlyJoinable;
  };
  const candidates = columns.filter(
    (column) => isCuttableColumn(column) || isUsed(column),
  );
  // a date in use takes the date slot, so it doesn't make room for a second date
  const dateColumn =
    candidates.find((column) => isUsed(column) && Lib.isTemporal(column)) ??
    getDefaultDateColumn(context, candidates);
  const others = candidates.filter(
    (column) =>
      column !== dateColumn && (isUsed(column) || !Lib.isTemporal(column)),
  );
  const dimensionColumns = [
    ...(dateColumn ? [dateColumn] : []),
    ...others.filter(isOwn),
    ...others.filter((column) => !isOwn(column)),
  ].filter((column, index) => index < MAX_DIMENSION_TABS || isUsed(column));

  const dimensionTabs = dimensionColumns.map((column): CutTab => {
    const info = Lib.displayInfo(query, STAGE_INDEX, column);
    const [position] = getBreakoutPositions(query, column);
    return {
      kind: "dimension",
      key: info.longDisplayName,
      label: info.displayName,
      longLabel: info.longDisplayName,
      column,
      breakout: position != null ? (breakouts[position] ?? null) : null,
      isActive: position != null,
    };
  });

  return [
    {
      kind: "rows",
      key: "rows",
      isActive: !hasAggregations && breakouts.length === 0,
    },
    {
      kind: "total",
      key: "total",
      isActive: hasAggregations && breakouts.length === 0,
    },
    ...dimensionTabs,
  ];
}

function withoutBreakouts(query: Lib.Query): Lib.Query {
  return Lib.breakouts(query, STAGE_INDEX).reduceRight(
    (nextQuery, breakout) => Lib.removeClause(nextQuery, STAGE_INDEX, breakout),
    query,
  );
}

function withoutAggregations(query: Lib.Query): Lib.Query {
  return Lib.aggregations(query, STAGE_INDEX).reduceRight(
    (nextQuery, aggregation) =>
      Lib.removeClause(nextQuery, STAGE_INDEX, aggregation),
    query,
  );
}

/**
 * Makes sure the slice is summarized by something: the calculations it had before it went back
 * to rows, or a count.
 */
function withCalculations(
  query: Lib.Query,
  previousAggregations: readonly Lib.AggregationClause[],
): Lib.Query {
  if (Lib.aggregations(query, STAGE_INDEX).length > 0) {
    return query;
  }
  if (previousAggregations.length > 0) {
    return previousAggregations.reduce(
      (nextQuery, aggregation) =>
        Lib.aggregate(nextQuery, STAGE_INDEX, aggregation),
      query,
    );
  }
  const count = Lib.availableAggregationOperators(query, STAGE_INDEX).find(
    (operator) =>
      Lib.displayInfo(query, STAGE_INDEX, operator).shortName === "count",
  );
  return count
    ? Lib.aggregate(query, STAGE_INDEX, Lib.aggregationClause(count))
    : query;
}

/**
 * The same slice cut another way. Filters never change; calculations carry over, or come back
 * from before the slice was shown as rows.
 */
export function applyCut(
  query: Lib.Query,
  tab: CutTab,
  previousAggregations: readonly Lib.AggregationClause[],
): Lib.Query {
  const ungrouped = withoutBreakouts(query);
  switch (tab.kind) {
    case "rows":
      return withoutAggregations(ungrouped);
    case "total":
      return withCalculations(ungrouped, previousAggregations);
    case "dimension":
      return Lib.breakout(
        withCalculations(ungrouped, previousAggregations),
        STAGE_INDEX,
        Lib.withDefaultBucket(query, STAGE_INDEX, tab.column),
      );
  }
}

/** Adds a grouping next to the current ones, like splitting a time series by category. */
export function addSplit(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  previousAggregations: readonly Lib.AggregationClause[],
): Lib.Query {
  return Lib.breakout(
    withCalculations(query, previousAggregations),
    STAGE_INDEX,
    Lib.withDefaultBucket(query, STAGE_INDEX, column),
  );
}
