import { useMemo } from "react";

import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "./types";

export const useQueryAggregations = ({
  query,
  onQueryChange,
  stageIndex,
}: UpdateQueryHookProps) => {
  const aggregations = useMemo(
    () => Lib.aggregations(query, stageIndex),
    [query, stageIndex],
  );

  const items = useMemo(
    () =>
      aggregations.map((aggregation, aggregationIndex) => {
        const { displayName } = Lib.displayInfo(query, stageIndex, aggregation);

        const operators = Lib.selectedAggregationOperators(
          Lib.availableAggregationOperators(query, stageIndex),
          aggregation,
        );

        const handleRemove = () => {
          const nextQuery = Lib.removeClause(query, stageIndex, aggregation);
          onQueryChange(nextQuery);
        };

        return {
          aggregation,
          aggregationIndex,
          operators,
          displayName,
          handleRemove,
        };
      }),
    [aggregations, onQueryChange, query, stageIndex],
  );

  return {
    items,
    onQueryChange,
  };
};
