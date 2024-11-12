import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import { STAGE_INDEX } from "./constants";
import type { UpdateQueryHookProps } from "./types";

export const useDefaultQueryAggregation = ({
  query: initialQuery,
  onQueryChange,
}: UpdateQueryHookProps) => {
  const [hasDefaultAggregation, setHasDefaultAggregation] = useState(() =>
    shouldAddDefaultAggregation(initialQuery),
  );

  const query = useMemo(
    () =>
      hasDefaultAggregation
        ? Lib.aggregateByCount(initialQuery, STAGE_INDEX)
        : initialQuery,
    [initialQuery, hasDefaultAggregation],
  );

  const hasAggregations = Lib.aggregations(query, STAGE_INDEX).length > 0;

  const handleUpdateQuery = (nextQuery: Lib.Query) => {
    setHasDefaultAggregation(false);
    onQueryChange(nextQuery);
  };

  const handleAggregationChange = (nextQuery: Lib.Query) => {
    const newAggregations = Lib.aggregations(nextQuery, STAGE_INDEX);
    setHasDefaultAggregation(false);

    if (!hasDefaultAggregation || newAggregations.length !== 0) {
      onQueryChange(nextQuery);
    }
  };

  return {
    query,
    hasAggregations,
    handleUpdateQuery,
    handleAggregationChange,
  };
};

function shouldAddDefaultAggregation(query: Lib.Query): boolean {
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  return aggregations.length === 0;
}
