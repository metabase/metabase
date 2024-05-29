import { t } from "ttag";

import * as Lib from "metabase-lib";

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

  if (!Lib.isDate(firstBreakoutColumn)) {
    return t`period`;
  }

  const bucket = Lib.temporalBucket(firstBreakout);

  if (!bucket) {
    return t`period`;
  }

  const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);

  return bucketInfo.displayName.toLowerCase();
};

export const getTitle = (
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause | undefined,
): string => {
  const period = getOffsetPeriod(query, stageIndex);

  if (!aggregation) {
    return t`Compare one of these to the previous ${period}`;
  }

  const info = Lib.displayInfo(query, stageIndex, aggregation);

  return t`Compare “${info.displayName}” to previous ${period}`;
};

export const getPeriodTitle = (): string => {
  // TODO: implement me
  return t`Previous period`;
};
