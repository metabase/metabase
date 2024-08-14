import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { ComparisonType } from "../../types";

export const getHelp = (
  query: Lib.Query,
  stageIndex: number,
  comparisonType: ComparisonType,
): string => {
  const firstBreakout = Lib.breakouts(query, stageIndex)[0];

  if (comparisonType === "moving-average") {
    return t`period moving average`;
  }

  if (!firstBreakout) {
    return t`periods ago based on grouping`;
  }

  const firstBreakoutColumn = Lib.breakoutColumn(
    query,
    stageIndex,
    firstBreakout,
  );
  const firstBreakoutColumnInfo = Lib.displayInfo(
    query,
    stageIndex,
    firstBreakoutColumn,
  );

  if (!Lib.isTemporal(firstBreakoutColumn)) {
    return t`rows above based on “${firstBreakoutColumnInfo.displayName}”`;
  }

  const bucket = Lib.temporalBucket(firstBreakout);

  if (!bucket) {
    return t`periods ago based on “${firstBreakoutColumnInfo.displayName}”`;
  }

  const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
  const periodPlural = Lib.describeTemporalUnit(
    bucketInfo.shortName,
    2,
  ).toLowerCase();

  return t`${periodPlural} ago based on “${firstBreakoutColumnInfo.displayName}”`;
};
