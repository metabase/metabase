import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { OFFSET_UNITS } from "./constants";
import type { OffsetData } from "./types";

export function getBreakoutColumns(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata[] {
  return Lib.breakoutableColumns(query, stageIndex).filter(column =>
    Lib.isTemporalBucketable(query, stageIndex, column),
  );
}

export function getInitialBreakoutColumn(
  query: Lib.Query,
  stageIndex: number,
): Lib.ColumnMetadata {
  const columns = getBreakoutColumns(query, stageIndex);
  return checkNotNull(columns[0]);
}

function getBreakoutUnit(
  query: Lib.Query,
  stageIndex: number,
  breakout: Lib.BreakoutClause,
) {
  const breakoutBucket = Lib.temporalBucket(breakout);
  if (!breakoutBucket) {
    return undefined;
  }

  const breakoutBucketInfo = Lib.displayInfo(query, stageIndex, breakoutBucket);
  return breakoutBucketInfo.shortName;
}

function getGroupBreakoutIndex(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);

  for (const breakoutIndex of breakoutPositions) {
    const breakout = breakouts[breakoutIndex];
    const breakoutUnit = getBreakoutUnit(query, stageIndex, breakout);
    if (breakoutUnit != null && OFFSET_UNITS[breakoutUnit]) {
      return breakoutIndex;
    }
  }

  return -1;
}

function getDefaultGroupUnit(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
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

  return undefined;
}

function getInitialGroupUnit(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  const breakoutIndex = getGroupBreakoutIndex(query, stageIndex, column);
  if (breakoutIndex < 0) {
    return checkNotNull(getDefaultGroupUnit(query, stageIndex, column));
  }

  const breakouts = Lib.breakouts(query, stageIndex);
  const breakout = breakouts[breakoutIndex];
  return checkNotNull(getBreakoutUnit(query, stageIndex, breakout));
}

function getOffsetBreakoutIndex(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
) {
  const breakouts = Lib.breakouts(query, stageIndex);
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);

  for (const breakoutIndex of breakoutPositions) {
    const breakout = breakouts[breakoutIndex];
    const breakoutUnit = getBreakoutUnit(query, stageIndex, breakout);
    if (breakoutUnit != null && breakoutUnit !== groupUnit) {
      const offsetUnits = OFFSET_UNITS[groupUnit];
      if (offsetUnits != null && offsetUnits.includes(breakoutUnit)) {
        return breakoutIndex;
      }
    }
  }

  return -1;
}

function getInitialOffsetUnit(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  groupUnit: TemporalUnit,
) {
  const breakoutIndex = getOffsetBreakoutIndex(
    query,
    stageIndex,
    column,
    groupUnit,
  );
  if (breakoutIndex < 0) {
    return groupUnit;
  }

  const breakouts = Lib.breakouts(query, stageIndex);
  const breakout = breakouts[breakoutIndex];
  return getBreakoutUnit(query, stageIndex, breakout) ?? groupUnit;
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
    offsetUnit,
  };
}
