import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import {
  COLUMN_TYPES,
  COLUMN_TYPE_NAMES,
  OFFSET_DISPLAY_UNITS,
  OFFSET_UNITS,
} from "./constants";
import type { ComparisonType, OffsetData } from "./types";

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
  return Lib.aggregations(query, stageIndex);
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
) {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);

  for (const breakoutIndex of breakoutPositions) {
    const breakout = breakouts[breakoutIndex];
    const bucket = Lib.temporalBucket(breakout);
    if (bucket != null) {
      const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
      return { breakoutIndex, breakoutUnit: bucketInfo.shortName };
    }
  }
}

function getOffsetBreakoutInfo(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
) {
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

export function getInitialData(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): OffsetData {
  const groupUnit = getInitialGroupUnit(query, stageIndex, column);
  const offsetUnit = getInitialOffsetUnit(query, stageIndex, column, groupUnit);

  return {
    comparisonType: "offset",
    columnType: "offset",
    groupUnit,
    offsetValue: 1,
    offsetUnit,
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
