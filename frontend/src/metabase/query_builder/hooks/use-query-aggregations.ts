import * as Lib from "metabase-lib";

import { STAGE_INDEX } from "./constants";
import type { UpdateQueryHookProps } from "./types";

export const useQueryAggregations = ({
  query,
  onQueryChange,
}: UpdateQueryHookProps) => {
  const aggregations = Lib.aggregations(query, STAGE_INDEX);

  const aggregationData = aggregations.map((aggregation, aggregationIndex) => {
    const { displayName } = Lib.displayInfo(query, STAGE_INDEX, aggregation);

    const operators = Lib.selectedAggregationOperators(
      Lib.availableAggregationOperators(query, STAGE_INDEX),
      aggregation,
    );

    const handleRemove = () => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, aggregation);
      onQueryChange(nextQuery);
    };

    return {
      aggregation,
      aggregationIndex,
      operators,
      displayName,
      handleRemove,
    };
  });

  return {
    stageIndex: STAGE_INDEX,
    aggregationData: aggregationData,
    handleQueryChange: onQueryChange,
  };
};
