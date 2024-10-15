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
  const columns = getSupportedBreakoutColumns(query, stageIndex);
  if (columns.length === 0) {
    throw new Error("No supported breakout column found.");
  }

  const columnWithBreakout = columns.find(column => {
    const { breakoutPositions = [] } = Lib.displayInfo(
      query,
      stageIndex,
      column,
    );
    return breakoutPositions.length > 0;
  });

  return columnWithBreakout ?? columns[0];
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

export function getOffsetValueMin(comparisonType: ComparisonType) {
  return comparisonType === "moving-average" ? 2 : 1;
}

function getOffsetUnitLabel(offsetUnit: TemporalUnit, offsetValue: number) {
  return Lib.describeTemporalUnit(
    OFFSET_DISPLAY_UNITS[offsetUnit] ?? offsetUnit,
    offsetValue,
  );
}

export function getOffsetUnits(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
) {
  return Lib.availableTemporalBuckets(query, stageIndex, column)
    .map(bucket => Lib.displayInfo(query, stageIndex, bucket).shortName)
    .filter(unit => OFFSET_UNITS[groupUnit]?.includes(unit));
}

export function getOffsetUnitOptions(
  offsetUnits: TemporalUnit[],
  offsetValue: number,
) {
  return offsetUnits.map(unit => ({
    value: unit,
    label: getOffsetUnitLabel(unit, offsetValue),
  }));
}

export function canSelectOffsetUnit(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
) {
  const offsetUnits = getOffsetUnits(query, stageIndex, column, groupUnit);
  return offsetUnits.length > 1;
}

export function getOffsetLabel(
  comparisonType: ComparisonType,
  offsetUnit: TemporalUnit,
  offsetValue: number,
  canSelectOffset: boolean,
) {
  const offsetUnitLabel = getOffsetUnitLabel(
    offsetUnit,
    offsetValue,
  ).toLowerCase();

  switch (comparisonType) {
    case "offset":
      return canSelectOffset ? t`ago` : t`${offsetUnitLabel} ago`;
    case "moving-average":
      return canSelectOffset
        ? t`moving average`
        : t`${offsetUnitLabel} moving average`;
  }
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

export function setOffsetValue(
  options: OffsetOptions,
  offsetValue: number,
): OffsetOptions {
  const min = getOffsetValueMin(options.comparisonType);

  return {
    ...options,
    offsetValue: Math.floor(Math.max(Math.abs(offsetValue), min)),
  };
}

export function applyOffsetClause(
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
  aggregation: Lib.AggregationClause,
  { columnType, offsetValue, includeCurrent }: OffsetOptions,
) {
  switch (columnType) {
    case "offset":
      return Lib.offsetClause(aggregation, -offsetValue);
    case "diff-offset":
      return Lib.diffOffsetClause(aggregation, -offsetValue);
    case "percent-diff-offset":
      return Lib.percentDiffOffsetClause(aggregation, -offsetValue);
    case "moving-average":
      return Lib.movingAverageClause(aggregation, -offsetValue, includeCurrent);
    case "diff-moving-average":
      return Lib.diffMovingAverageClause(
        aggregation,
        -offsetValue,
        includeCurrent,
      );
    case "percent-diff-moving-average":
      return Lib.percentDiffMovingAverageClause(
        aggregation,
        -offsetValue,
        includeCurrent,
      );
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
  breakoutInfo: BreakoutInfo | undefined,
) {
  if (!breakoutInfo) {
    return Lib.breakout(query, stageIndex, column);
  }

  const breakouts = Lib.breakouts(query, stageIndex);
  return Lib.replaceClause(
    query,
    stageIndex,
    breakouts[breakoutInfo.breakoutIndex],
    column,
  );
}

function applyGroupBreakout(
  query: Lib.Query,
  stageIndex: number,
  { groupUnit }: OffsetOptions,
) {
  const column = getBreakoutColumn(query, stageIndex);
  const bucket = findTemporalBucket(query, stageIndex, column, groupUnit);
  return applyBreakout(
    query,
    stageIndex,
    Lib.withTemporalBucket(column, bucket),
    getGroupBreakoutInfo(query, stageIndex, column),
  );
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
  return applyBreakout(
    query,
    stageIndex,
    Lib.withTemporalBucket(column, bucket),
    getOffsetBreakoutInfo(query, stageIndex, column, groupUnit),
  );
}

function removeExtraBreakouts(
  query: Lib.Query,
  stageIndex: number,
  { groupUnit }: OffsetOptions,
) {
  const column = getBreakoutColumn(query, stageIndex);
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

  const breakouts = Lib.breakouts(query, stageIndex);
  return breakouts.reduce((query, breakout, breakoutIndex) => {
    if (excludeBreakoutIndexes.includes(breakoutIndex)) {
      return query;
    }

    const column = Lib.breakoutColumn(query, stageIndex, breakout);
    return Lib.isTemporal(column)
      ? Lib.removeClause(query, stageIndex, breakout)
      : query;
  }, query);
}
