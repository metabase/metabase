import { useCallback, useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "./types";

export const useDefaultQueryAggregation = ({
  query: initialQuery,
  onQueryChange,
  stageIndex,
}: UpdateQueryHookProps) => {
  const [hasDefaultAggregation, setHasDefaultAggregation] = useState(() =>
    shouldAddDefaultAggregation(initialQuery, stageIndex),
  );

  const query = useMemo(
    () =>
      hasDefaultAggregation
        ? Lib.aggregateByCount(initialQuery, stageIndex)
        : initialQuery,
    [hasDefaultAggregation, initialQuery, stageIndex],
  );

  const hasAggregations = useMemo(
    () => Lib.aggregations(query, stageIndex).length > 0,
    [query, stageIndex],
  );

  const onUpdateQuery = useCallback(
    (nextQuery: Lib.Query) => {
      setHasDefaultAggregation(false);
      onQueryChange(nextQuery);
    },
    [onQueryChange],
  );

  const onAggregationChange = useCallback(
    (nextQuery: Lib.Query) => {
      const newAggregations = Lib.aggregations(nextQuery, stageIndex);
      setHasDefaultAggregation(false);

      if (!hasDefaultAggregation || newAggregations.length !== 0) {
        onQueryChange(nextQuery);
      }
    },
    [hasDefaultAggregation, onQueryChange, stageIndex],
  );

  return {
    query,
    hasAggregations,
    onUpdateQuery,
    onAggregationChange,
  };
};

function shouldAddDefaultAggregation(
  query: Lib.Query,
  stageIndex = -1,
): boolean {
  const aggregations = Lib.aggregations(query, stageIndex);
  return aggregations.length === 0;
}
