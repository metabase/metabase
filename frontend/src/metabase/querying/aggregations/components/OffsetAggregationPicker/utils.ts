import { t } from "ttag";

import * as Lib from "metabase-lib";

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

export function canAddOffsetAggregation(query: Lib.Query, stageIndex: number) {
  const aggregations = Lib.aggregations(query, stageIndex);
  return aggregations.length > 0;
}
