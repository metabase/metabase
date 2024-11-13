import { useCallback } from "react";

import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "./types";

export const useBreakoutQueryHandlers = ({
  query,
  onQueryChange,
  stageIndex,
}: UpdateQueryHookProps) => {
  const handleAddBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.breakout(query, stageIndex, column);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  const handleUpdateBreakout = useCallback(
    (clause: Lib.BreakoutClause, column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceClause(query, stageIndex, clause, column);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  const handleRemoveBreakout = useCallback(
    (clause: Lib.BreakoutClause) => {
      const nextQuery = Lib.removeClause(query, stageIndex, clause);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  const handleReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceBreakouts(query, stageIndex, column);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  return {
    handleAddBreakout,
    handleUpdateBreakout,
    handleRemoveBreakout,
    handleReplaceBreakouts,
  };
};
