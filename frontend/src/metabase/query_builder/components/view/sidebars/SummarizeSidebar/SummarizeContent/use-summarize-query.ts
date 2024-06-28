import { useCallback, useMemo, useState } from "react";

import * as Lib from "metabase-lib";

export const STAGE_INDEX = -1;

export const useSummarizeQuery = (
  initialQuery: Lib.Query,
  onQueryChange: (query: Lib.Query) => void,
) => {
  const [hasDefaultAggregation, setHasDefaultAggregation] = useState(() =>
    canAddDefaultAggregation(initialQuery),
  );

  const query = useMemo(
    () => getQuery(initialQuery, hasDefaultAggregation),
    [initialQuery, hasDefaultAggregation],
  );

  const handleChange = useCallback(
    (query: Lib.Query) => {
      setHasDefaultAggregation(false);
      onQueryChange(query);
    },
    [onQueryChange],
  );

  const handleAddAggregations = useCallback(
    (aggregations: Lib.Aggregable[]) => {
      const nextQuery = aggregations.reduce(
        (query, aggregation) => Lib.aggregate(query, STAGE_INDEX, aggregation),
        query,
      );
      handleChange(nextQuery);
    },
    [query, handleChange],
  );

  const handleUpdateAggregation = useCallback(
    (aggregation: Lib.AggregationClause, nextAggregation: Lib.Aggregable) => {
      const nextQuery = Lib.replaceClause(
        query,
        STAGE_INDEX,
        aggregation,
        nextAggregation,
      );
      handleChange(nextQuery);
    },
    [query, handleChange],
  );

  const handleRemoveAggregation = useCallback(
    (aggregation: Lib.AggregationClause) => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, aggregation);
      handleChange(nextQuery);
    },
    [query, handleChange],
  );

  const handleAddBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.breakout(query, STAGE_INDEX, column);
      handleChange(nextQuery);
    },
    [query, handleChange],
  );

  const handleUpdateBreakout = useCallback(
    (clause: Lib.BreakoutClause, column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceClause(query, STAGE_INDEX, clause, column);
      handleChange(nextQuery);
    },
    [query, handleChange],
  );

  const handleRemoveBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const { breakoutPosition } = Lib.displayInfo(query, STAGE_INDEX, column);
      if (typeof breakoutPosition === "number") {
        const breakouts = Lib.breakouts(query, STAGE_INDEX);
        const clause = breakouts[breakoutPosition];
        const nextQuery = Lib.removeClause(query, STAGE_INDEX, clause);
        handleChange(nextQuery);
      }
    },
    [query, handleChange],
  );

  const handleReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceBreakouts(query, STAGE_INDEX, column);
      handleChange(nextQuery);
    },
    [query, handleChange],
  );
  return {
    query,
    stageIndex: STAGE_INDEX,
    handleAddAggregations,
    handleUpdateAggregation,
    handleRemoveAggregation,
    handleAddBreakout,
    handleUpdateBreakout,
    handleRemoveBreakout,
    handleReplaceBreakouts,
  };
};

function canAddDefaultAggregation(query: Lib.Query) {
  const hasAggregations = Lib.aggregations(query, STAGE_INDEX).length > 0;
  const hasBreakouts = Lib.breakouts(query, STAGE_INDEX).length > 0;

  return (
    !hasAggregations && !hasBreakouts && !Lib.isMetricBased(query, STAGE_INDEX)
  );
}

function getQuery(query: Lib.Query, hasDefaultAggregation: boolean) {
  return hasDefaultAggregation ? Lib.aggregateByCount(query) : query;
}
