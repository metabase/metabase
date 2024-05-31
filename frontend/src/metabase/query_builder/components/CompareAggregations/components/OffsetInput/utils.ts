import { t } from "ttag";

import { pluralize } from "metabase/lib/formatting";
import * as Lib from "metabase-lib";

export const getLabel = (query: Lib.Query, stageIndex: number): string => {
  const firstBreakout = Lib.breakouts(query, stageIndex)[0];

  if (firstBreakout) {
    const firstBreakoutColumn = Lib.breakoutColumn(
      query,
      stageIndex,
      firstBreakout,
    );

    if (!Lib.isDate(firstBreakoutColumn)) {
      return t`Row for comparison`;
    }
  }

  return t`Previous period`;
};

export const getHelp = (query: Lib.Query, stageIndex: number): string => {
  const firstBreakout = Lib.breakouts(query, stageIndex)[0];

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

  if (!Lib.isDate(firstBreakoutColumn)) {
    return t`rows above based on “${firstBreakoutColumnInfo.displayName}”`;
  }

  const bucket = Lib.temporalBucket(firstBreakout);

  if (!bucket) {
    return t`periods ago based on “${firstBreakoutColumnInfo.displayName}”`;
  }

  const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);

  return t`${pluralize(bucketInfo.displayName.toLowerCase())} ago based on “${
    firstBreakoutColumnInfo.displayName
  }”`;
};
