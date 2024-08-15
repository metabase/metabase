import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { ColumnType } from "./types";

export const getOffsetPeriod = (
  query: Lib.Query,
  stageIndex: number,
): string => {
  const firstBreakout = Lib.breakouts(query, stageIndex)[0];

  if (!firstBreakout) {
    return t`period`;
  }

  const firstBreakoutColumn = Lib.breakoutColumn(
    query,
    stageIndex,
    firstBreakout,
  );

  if (!Lib.isTemporal(firstBreakoutColumn)) {
    return t`rows`;
  }

  const bucket = Lib.temporalBucket(firstBreakout);

  if (!bucket) {
    return t`period`;
  }

  const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
  const periodPlural = Lib.describeTemporalUnit(
    bucketInfo.shortName,
    2,
  ).toLowerCase();

  return periodPlural;
};

export const getTitle = (
  query: Lib.Query,
  stageIndex: number,
  aggregation?: Lib.AggregationClause | Lib.ExpressionClause,
): string => {
  if (!aggregation) {
    return t`Compare one of these to the past`;
  }

  const info = Lib.displayInfo(query, stageIndex, aggregation);
  return t`Compare “${info.displayName}” to the past`;
};

export const getAggregations = (
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause | Lib.ExpressionClause,
  columns: ColumnType[],
  offset: number,
  includeCurrentPeriod: boolean,
): Lib.ExpressionClause[] => {
  const aggregations: Lib.ExpressionClause[] = [];

  if (columns.includes("offset")) {
    aggregations.push(
      Lib.offsetClause(query, stageIndex, aggregation, -offset),
    );
  }

  if (columns.includes("diff-offset")) {
    aggregations.push(
      Lib.diffOffsetClause(query, stageIndex, aggregation, -offset),
    );
  }

  if (columns.includes("percent-diff-offset")) {
    aggregations.push(
      Lib.percentDiffOffsetClause(query, stageIndex, aggregation, -offset),
    );
  }

  if (columns.includes("moving-average")) {
    aggregations.push(
      Lib.movingAverageClause({
        query,
        stageIndex,
        clause: aggregation,
        offset: -offset,
        includeCurrentPeriod,
      }),
    );
  }

  if (columns.includes("diff-moving-average")) {
    aggregations.push(
      Lib.diffMovingAverageClause({
        query,
        stageIndex,
        clause: aggregation,
        offset: -offset,
        includeCurrentPeriod,
      }),
    );
  }

  if (columns.includes("percent-diff-moving-average")) {
    aggregations.push(
      Lib.percentDiffMovingAverageClause({
        query,
        stageIndex,
        clause: aggregation,
        offset: -offset,
        includeCurrentPeriod,
      }),
    );
  }

  return aggregations;
};

type BreakoutColumnAndBucket = {
  breakoutIndex: number | null;
  column: Lib.ColumnMetadata;
  bucket: Lib.Bucket | null;
};

export function getBreakout(
  query: Lib.Query,
  stageIndex: number,
): BreakoutColumnAndBucket | null {
  const breakouts = Lib.breakouts(query, stageIndex);
  const breakoutIndex = breakouts.findIndex(breakout =>
    isTemporal(query, stageIndex, breakout),
  );
  if (breakoutIndex >= 0) {
    const breakout = breakouts[breakoutIndex];
    return {
      breakoutIndex,
      column: Lib.breakoutColumn(query, stageIndex, breakout),
      bucket: Lib.temporalBucket(breakout),
    };
  }

  const columns = Lib.breakoutableColumns(query, stageIndex);
  const temporalColumn = columns.find(column => Lib.isTemporal(column));

  if (temporalColumn) {
    return {
      breakoutIndex: null,
      column: temporalColumn,
      bucket: Lib.defaultTemporalBucket(query, stageIndex, temporalColumn),
    };
  }

  return null;
}

function isTemporal(
  query: Lib.Query,
  stageIndex: number,
  breakout: Lib.BreakoutClause,
) {
  const column = Lib.breakoutColumn(query, stageIndex, breakout);
  return Lib.isTemporal(column);
}

export const canSubmit = (
  period: number | "",
  columns: ColumnType[],
): boolean => {
  const isPeriodValid = typeof period === "number" && period > 0;
  const areColumnsValid = columns.length > 0;
  return isPeriodValid && areColumnsValid;
};

type UpdatedQuery = {
  query: Lib.Query;
  addedAggregations: Lib.ExpressionClause[];
};

export function updateQueryWithCompareOffsetAggregations(
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause | Lib.ExpressionClause,
  offset: "" | number,
  columns: ColumnType[],
  columnAndBucket: BreakoutColumnAndBucket,
  includeCurrentPeriod: boolean,
): UpdatedQuery | null {
  if (!aggregation || offset === "") {
    return null;
  }

  let nextQuery = query;
  const column = Lib.withTemporalBucket(
    columnAndBucket.column,
    columnAndBucket.bucket,
  );

  let { breakoutIndex } = columnAndBucket;
  if (breakoutIndex !== null) {
    // replace the breakout
    const breakout = Lib.breakouts(nextQuery, stageIndex)[breakoutIndex];
    nextQuery = Lib.replaceClause(nextQuery, stageIndex, breakout, column);
  } else {
    // add the breakout
    nextQuery = Lib.breakout(nextQuery, stageIndex, column);
    breakoutIndex = Lib.breakouts(nextQuery, stageIndex).length - 1;
  }

  if (breakoutIndex > 0) {
    const breakouts = Lib.breakouts(nextQuery, stageIndex);

    // move the breakout to the front
    nextQuery = Lib.swapClauses(
      nextQuery,
      stageIndex,
      breakouts[0],
      breakouts[breakoutIndex],
    );
  }

  const aggregations = getAggregations(
    nextQuery,
    stageIndex,
    aggregation,
    columns,
    offset,
    includeCurrentPeriod,
  );

  nextQuery = aggregations.reduce(
    (query, aggregation) => Lib.aggregate(query, stageIndex, aggregation),
    nextQuery,
  );

  return {
    query: nextQuery,
    addedAggregations: aggregations,
  };
}

export function canAddTemporalCompareAggregation(
  query: Lib.Query,
  stageIndex: number,
): boolean {
  const aggregations = Lib.aggregations(query, stageIndex);
  if (aggregations.length === 0) {
    // Hide the "Compare to the past" option if there are no aggregations
    return false;
  }

  const breakoutableColumns = Lib.breakoutableColumns(query, stageIndex);
  const hasAtLeastOneTemporalBreakoutColumn = breakoutableColumns.some(column =>
    Lib.isTemporal(column),
  );

  if (!hasAtLeastOneTemporalBreakoutColumn) {
    // Hide the "Compare to the past" option if there are no
    // temporal columns to break out on
    return false;
  }

  return true;
}
