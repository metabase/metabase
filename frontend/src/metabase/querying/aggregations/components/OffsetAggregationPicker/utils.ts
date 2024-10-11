import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import {
  COLUMN_TYPES,
  COLUMN_TYPE_NAMES,
  OFFSET_DISPLAY_UNITS,
  OFFSET_UNITS,
} from "./constants";
import type { BreakoutInfo, ComparisonType, OffsetOptions } from "./types";

export function getTitle(
  query: Lib.Query,
  stageIndex: number,
  aggregation?: Lib.AggregationClause,
) {
  if (!aggregation) {
    return t`Which measure do you want to compare?`;
  }

  const aggregationInfo = Lib.displayInfo(query, stageIndex, aggregation);
  return t`Compare “${aggregationInfo.displayName}” to the past`;
}

export function getSupportedAggregations(query: Lib.Query, stageIndex: number) {
  return Lib.aggregations(query, stageIndex).filter(aggregation => {
    const functions = Lib.functionsUsedByExpression(
      query,
      stageIndex,
      aggregation,
    );
    return !functions.includes("offset");
  });
}

export function getSupportedBreakoutColumns(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata[] {
  return Lib.breakoutableColumns(query, stageIndex).filter(column =>
    Lib.isTemporalBucketable(query, stageIndex, column),
  );
}

export function canAddOffsetAggregation(query: Lib.Query, stageIndex: number) {
  const aggregations = getSupportedAggregations(query, stageIndex);
  const columns = getSupportedBreakoutColumns(query, stageIndex);
  if (aggregations.length === 0 || columns.length === 0) {
    return false;
  }

  const column = getBreakoutColumn(query, stageIndex);
  const groupUnit = getDefaultGroupUnit(query, stageIndex, column);
  return groupUnit != null;
}

export function getBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata {
  const [column] = getSupportedBreakoutColumns(query, stageIndex);
  if (!column) {
    throw new Error("No supported breakout column found.");
  }

  return column;
}

function getGroupBreakoutInfo(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): BreakoutInfo | undefined {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);

  for (const breakoutIndex of breakoutPositions) {
    const breakout = breakouts[breakoutIndex];
    const bucket = Lib.temporalBucket(breakout);
    if (bucket != null) {
      const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
      const breakoutUnit = bucketInfo.shortName;
      if (OFFSET_UNITS[breakoutUnit]) {
        return { breakoutIndex, breakoutUnit };
      }
    }
  }
}

function getOffsetBreakoutInfo(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
): BreakoutInfo | undefined {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);

  for (const breakoutIndex of breakoutPositions) {
    const breakout = breakouts[breakoutIndex];
    const bucket = Lib.temporalBucket(breakout);
    if (bucket) {
      const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
      const breakoutUnit = bucketInfo.shortName;
      const offsetUnits = OFFSET_UNITS[groupUnit];
      if (breakoutUnit !== groupUnit && offsetUnits?.includes(breakoutUnit)) {
        return { breakoutIndex, breakoutUnit };
      }
    }
  }
}

function getDefaultGroupUnit(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): TemporalUnit | undefined {
  const bucketsInfo = Lib.availableTemporalBuckets(
    query,
    stageIndex,
    column,
  ).map(bucket => Lib.displayInfo(query, stageIndex, bucket));

  const defaultBucketInfo = bucketsInfo.find(bucketInfo => bucketInfo.default);
  if (defaultBucketInfo && OFFSET_UNITS[defaultBucketInfo.shortName]) {
    return defaultBucketInfo.shortName;
  }

  const offsetBucketInfo = bucketsInfo.find(
    bucketInfo => OFFSET_UNITS[bucketInfo.shortName],
  );
  if (offsetBucketInfo) {
    return offsetBucketInfo.shortName;
  }
}

function getInitialGroupUnit(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const breakoutInfo = getGroupBreakoutInfo(query, stageIndex, column);
  if (breakoutInfo) {
    return breakoutInfo.breakoutUnit;
  }

  const groupUnit = getDefaultGroupUnit(query, stageIndex, column);
  if (!groupUnit) {
    throw new Error("No default group unit found");
  }

  return groupUnit;
}

function getInitialOffsetUnit(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
) {
  const breakoutInfo = getOffsetBreakoutInfo(
    query,
    stageIndex,
    column,
    groupUnit,
  );

  return breakoutInfo?.breakoutUnit ?? groupUnit;
}

export function getInitialOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): OffsetOptions {
  const groupUnit = getInitialGroupUnit(query, stageIndex, column);
  const offsetUnit = getInitialOffsetUnit(query, stageIndex, column, groupUnit);

  return {
    comparisonType: "offset",
    columnType: "offset",
    groupUnit,
    offsetValue: 1,
    offsetUnit,
    includeCurrent: false,
  };
}

export function getGroupUnitOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(bucket => Lib.displayInfo(query, stageIndex, bucket).shortName)
    .filter(unit => OFFSET_UNITS[unit])
    .map(unit => ({
      value: unit,
      label: Lib.describeTemporalUnit(unit),
    }));
}

export function getOffsetUnitOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
) {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(bucket => Lib.displayInfo(query, stageIndex, bucket).shortName)
    .filter(unit => OFFSET_UNITS[groupUnit]?.includes(unit))
    .map(unit => ({
      value: unit,
      label: Lib.describeTemporalUnit(OFFSET_DISPLAY_UNITS[unit] ?? unit),
    }));
}

export function getColumnTypeOptions(comparisonType: ComparisonType) {
  return COLUMN_TYPES[comparisonType].map(columnType => ({
    value: columnType,
    label: COLUMN_TYPE_NAMES[columnType],
  }));
}

export function getIncludeCurrentLabel(offsetUnit: TemporalUnit) {
  const displayUnit = OFFSET_DISPLAY_UNITS[offsetUnit] ?? offsetUnit;
  const offsetUnitLabel = Lib.describeTemporalUnit(displayUnit).toLowerCase();
  return t`Include this ${offsetUnitLabel}`;
}

export function applyOffset(
  query: Lib.Query,
  stageIndex: number,
  offset: Lib.ExpressionClause,
  options: OffsetOptions,
) {
  let newQuery = query;
  newQuery = Lib.aggregate(newQuery, stageIndex, offset);
  newQuery = removeExtraBreakouts(newQuery, stageIndex, options);
  newQuery = applyOffsetBreakout(newQuery, stageIndex, options);
  newQuery = applyGroupBreakout(newQuery, stageIndex, options);
  return newQuery;
}

export function getOffsetClause(
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause,
  { columnType, offsetValue, includeCurrent }: OffsetOptions,
) {
  switch (columnType) {
    case "offset":
      return Lib.offsetClause(query, stageIndex, aggregation, -offsetValue);
    case "diff-offset":
      return Lib.diffOffsetClause(query, stageIndex, aggregation, -offsetValue);
    case "percent-diff-offset":
      return Lib.percentDiffOffsetClause(
        query,
        stageIndex,
        aggregation,
        -offsetValue,
      );
    case "moving-average":
      return Lib.movingAverageClause({
        query,
        stageIndex,
        clause: aggregation,
        offset: -offsetValue,
        includeCurrentPeriod: includeCurrent,
      });
    case "diff-moving-average":
      return Lib.diffMovingAverageClause({
        query,
        stageIndex,
        clause: aggregation,
        offset: -offsetValue,
        includeCurrentPeriod: includeCurrent,
      });
    case "percent-diff-moving-average":
      return Lib.percentDiffMovingAverageClause({
        query,
        stageIndex,
        clause: aggregation,
        offset: -offsetValue,
        includeCurrentPeriod: includeCurrent,
      });
  }
}

function findTemporalBucket(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  unit: TemporalUnit,
) {
  const bucket = Lib.availableTemporalBuckets(query, stageIndex, column).find(
    bucket => {
      const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
      return bucketInfo.shortName === unit;
    },
  );

  return bucket ? bucket : null;
}

function applyBreakout(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  breakoutInfo?: BreakoutInfo,
) {
  const breakouts = Lib.breakouts(query, stageIndex);
  const newQuery = breakoutInfo
    ? Lib.replaceClause(
        query,
        stageIndex,
        breakouts[breakoutInfo.breakoutIndex],
        column,
      )
    : Lib.breakout(query, stageIndex, column);
  const newBreakoutIndex = breakoutInfo
    ? breakoutInfo.breakoutIndex
    : breakouts.length;

  if (newBreakoutIndex > 0) {
    const newBreakouts = Lib.breakouts(newQuery, stageIndex);
    return Lib.swapClauses(
      newQuery,
      stageIndex,
      newBreakouts[0],
      newBreakouts[newBreakoutIndex],
    );
  } else {
    return newQuery;
  }
}

function applyGroupBreakout(
  query: Lib.Query,
  stageIndex: number,
  { groupUnit }: OffsetOptions,
) {
  const column = getBreakoutColumn(query, stageIndex);
  const bucket = findTemporalBucket(query, stageIndex, column, groupUnit);
  const columnWithBucket = Lib.withTemporalBucket(column, bucket);
  const breakoutInfo = getGroupBreakoutInfo(query, stageIndex, column);
  return applyBreakout(query, stageIndex, columnWithBucket, breakoutInfo);
}

function applyOffsetBreakout(
  query: Lib.Query,
  stageIndex: number,
  { groupUnit, offsetUnit }: OffsetOptions,
) {
  if (offsetUnit === groupUnit) {
    return query;
  }

  const column = getBreakoutColumn(query, stageIndex);
  const bucket = findTemporalBucket(query, stageIndex, column, offsetUnit);
  const columnWithBucket = Lib.withTemporalBucket(column, bucket);
  const breakoutInfo = getOffsetBreakoutInfo(
    query,
    stageIndex,
    column,
    groupUnit,
  );
  return applyBreakout(query, stageIndex, columnWithBucket, breakoutInfo);
}

function removeExtraBreakouts(
  query: Lib.Query,
  stageIndex: number,
  { groupUnit }: OffsetOptions,
) {
  const column = getBreakoutColumn(query, stageIndex);
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);
  const breakouts = Lib.breakouts(query, stageIndex);
  const groupBreakoutInfo = getGroupBreakoutInfo(query, stageIndex, column);
  const offsetBreakoutInfo = getOffsetBreakoutInfo(
    query,
    stageIndex,
    column,
    groupUnit,
  );
  const excludeBreakoutIndexes = [
    groupBreakoutInfo?.breakoutIndex,
    offsetBreakoutInfo?.breakoutIndex,
  ];

  return breakoutPositions.reduce(
    (query, breakoutIndex) =>
      excludeBreakoutIndexes.includes(breakoutIndex)
        ? query
        : Lib.removeClause(query, stageIndex, breakouts[breakoutIndex]),
    query,
  );
}
