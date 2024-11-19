import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "../hooks/types";

export const getAggregationItems = ({
  query,
  stageIndex,
}: Pick<UpdateQueryHookProps, "query" | "stageIndex">) => {
  const aggregations = Lib.aggregations(query, stageIndex);

  return aggregations.map((aggregation, aggregationIndex) => {
    const { displayName } = Lib.displayInfo(query, stageIndex, aggregation);

    const operators = Lib.selectedAggregationOperators(
      Lib.availableAggregationOperators(query, stageIndex),
      aggregation,
    );

    return {
      aggregation,
      aggregationIndex,
      operators,
      displayName,
    };
  });
};
