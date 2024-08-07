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
  const period = getOffsetPeriod(query, stageIndex);

  if (!aggregation) {
    return t`Compare one of these to the previous ${period}`;
  }

  const info = Lib.displayInfo(query, stageIndex, aggregation);

  return t`Compare “${info.displayName}” to previous ${period}`;
};

export const getAggregations = (
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause | Lib.ExpressionClause,
  columns: ColumnType[],
  offset: number,
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

  return aggregations;
};

type BreakoutColumnAndBucket = {
  breakout?: Lib.BreakoutClause;
  column: Lib.ColumnMetadata;
  bucket: Lib.Bucket | null;
};

export function getBreakout(
  query: Lib.Query,
  stageIndex: number,
): BreakoutColumnAndBucket | null {
  const breakouts = Lib.breakouts(query, stageIndex);
  const temporalBreakout = breakouts.find(breakout =>
    isTemporal(query, stageIndex, breakout),
  );
  if (temporalBreakout) {
    return {
      breakout: temporalBreakout,
      column: Lib.breakoutColumn(query, stageIndex, temporalBreakout),
      bucket: Lib.temporalBucket(temporalBreakout),
    };
  }

  const columns = Lib.breakoutableColumns(query, stageIndex);
  const temporalColumn = columns.find(column => Lib.isTemporal(column));

  if (temporalColumn) {
    return {
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
