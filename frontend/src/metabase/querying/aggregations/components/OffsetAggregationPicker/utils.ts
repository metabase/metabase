import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import {
  COLUMN_TYPES,
  COLUMN_TYPE_INFO,
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

function isSupportedAggregation(
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause,
) {
  const functions = Lib.functionsUsedByExpression(
    query,
    stageIndex,
    aggregation,
  );
  return !functions.includes("offset");
}

export function getSupportedAggregations(query: Lib.Query, stageIndex: number) {
  return Lib.aggregations(query, stageIndex).filter(aggregation =>
    isSupportedAggregation(query, stageIndex, aggregation),
  );
}

export function getSupportedBreakoutColumns(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata[] {
  return Lib.breakoutableColumns(query, stageIndex).filter(column =>
    Lib.isTemporalBucketable(query, stageIndex, column),
  );
}

export function canAddOffsetAggregation(
  query: Lib.Query,
  stageIndex: number,
  initialAggregation?: Lib.AggregationClause,
) {
  const aggregations = getSupportedAggregations(query, stageIndex);
  const columns = getSupportedBreakoutColumns(query, stageIndex);
  if (aggregations.length === 0 || columns.length === 0) {
    return false;
  }

  const column = getBreakoutColumn(query, stageIndex);
  const groupUnit = getDefaultGroupUnit(query, stageIndex, column);
  if (!groupUnit) {
    return false;
  }

  return (
    !initialAggregation ||
    isSupportedAggregation(query, stageIndex, initialAggregation)
  );
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

export function getInitialAggregation(
  aggregations: Lib.AggregationClause[],
  initialAggregation?: Lib.AggregationClause,
) {
  if (initialAggregation) {
    return initialAggregation;
  } else {
    return aggregations.length === 1 ? aggregations[0] : undefined;
  }
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
    label: COLUMN_TYPE_INFO[columnType].label,
  }));
}

export function getIncludeCurrentLabel(offsetUnit: TemporalUnit) {
  const displayUnit = OFFSET_DISPLAY_UNITS[offsetUnit] ?? offsetUnit;
  const offsetUnitLabel = Lib.describeTemporalUnit(displayUnit).toLowerCase();
  return t`Include this ${offsetUnitLabel}`;
}

export function getOffsetValueMin(comparisonType: ComparisonType) {
  return comparisonType === "moving-average" ? 2 : 1;
}

export function setComparisonType(
  options: OffsetOptions,
  comparisonType: ComparisonType,
): OffsetOptions {
  return {
    ...options,
    comparisonType,
    columnType: COLUMN_TYPES[comparisonType][0],
    offsetValue: Math.max(
      options.offsetValue,
      getOffsetValueMin(comparisonType),
    ),
  };
}

export function setGroupUnit(
  options: OffsetOptions,
  groupUnit: TemporalUnit,
): OffsetOptions {
  const offsetUnits = OFFSET_UNITS[groupUnit];

  return {
    ...options,
    groupUnit,
    offsetUnit: offsetUnits ? offsetUnits[0] : groupUnit,
  };
}

export function applyOffset(
  query: Lib.Query,
  stageIndex: number,
  offset: Lib.ExpressionClause,
  options: OffsetOptions,
) {
  let newQuery = query;
  newQuery = Lib.aggregate(newQuery, stageIndex, offset);
  newQuery = applyGroupBreakout(newQuery, stageIndex, options);
  newQuery = applyOffsetBreakout(newQuery, stageIndex, options);
  newQuery = removeExtraBreakouts(newQuery, stageIndex, options);
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

type ApplyBreakoutOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  breakoutInfo: BreakoutInfo | undefined;
  requiredBreakoutIndex: number;
};

function applyBreakout({
  query,
  stageIndex,
  column,
  breakoutInfo,
  requiredBreakoutIndex,
}: ApplyBreakoutOpts) {
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

  if (newBreakoutIndex !== requiredBreakoutIndex) {
    const newBreakouts = Lib.breakouts(newQuery, stageIndex);
    return Lib.swapClauses(
      newQuery,
      stageIndex,
      newBreakouts[requiredBreakoutIndex],
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
  return applyBreakout({
    query,
    stageIndex,
    column: Lib.withTemporalBucket(column, bucket),
    breakoutInfo: getGroupBreakoutInfo(query, stageIndex, column),
    requiredBreakoutIndex: 0,
  });
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
  return applyBreakout({
    query,
    stageIndex,
    column: Lib.withTemporalBucket(column, bucket),
    breakoutInfo: getOffsetBreakoutInfo(query, stageIndex, column, groupUnit),
    requiredBreakoutIndex: 1,
  });
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
