import { useCallback, useMemo, useState } from "react";

import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

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

  const handleQueryChange = useCallback(
    (nextQuery: Lib.Query) => {
      const newAggregations = Lib.aggregations(nextQuery, STAGE_INDEX);
      if (hasDefaultAggregation && newAggregations.length === 0) {
        setHasDefaultAggregation(false);
      } else {
        handleChange(nextQuery);
      }
    },
    [handleChange, hasDefaultAggregation],
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
    (clause: Lib.BreakoutClause) => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, clause);
      handleChange(nextQuery);
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
    handleQueryChange,
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
