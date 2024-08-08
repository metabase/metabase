import { useCallback, useMemo, useState } from "react";

import * as Lib from "metabase-lib";

export const STAGE_INDEX = -1;

interface UseSummarizeQueryProps {
  query: Lib.Query;
  onQueryChange: (nextQuery: Lib.Query) => void;
}

export const useSummarizeQuery = ({
  query: initialQuery,
  onQueryChange,
}: UseSummarizeQueryProps) => {
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

  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  const hasAggregations = aggregations.length > 0;

  const handleChange = useCallback(
    (nextQuery: Lib.Query) => {
      setHasDefaultAggregation(false);
      onQueryChange(nextQuery);
    },
    [onQueryChange],
  );

  const handleAddAggregation = useCallback(
    (aggregation: Lib.Aggregable) => {
      const nextQuery = Lib.aggregate(query, STAGE_INDEX, aggregation);
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
      if (hasDefaultAggregation) {
        setHasDefaultAggregation(false);
      } else {
        handleChange(Lib.removeClause(query, STAGE_INDEX, aggregation));
      }
    },
    [query, hasDefaultAggregation, handleChange],
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
      if (breakoutPosition != null) {
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
    aggregations,
    hasAggregations,
    handleAddAggregation,
    handleUpdateAggregation,
    handleRemoveAggregation,
    handleAddBreakout,
    handleUpdateBreakout,
    handleRemoveBreakout,
    handleReplaceBreakouts,
  };
};

function shouldAddDefaultAggregation(query: Lib.Query): boolean {
  const aggregations = Lib.aggregations(query, STAGE_INDEX);
  return aggregations.length === 0;
}
