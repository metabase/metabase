import { useCallback } from "react";

import * as Lib from "metabase-lib";

import type { UpdateQueryHookProps } from "./types";

export const useBreakoutQueryHandlers = ({
  query,
  onQueryChange,
  stageIndex,
}: UpdateQueryHookProps) => {
  const onAddBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.breakout(query, stageIndex, column);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  const onUpdateBreakout = useCallback(
    (clause: Lib.BreakoutClause, column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceClause(query, stageIndex, clause, column);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  const onRemoveBreakout = useCallback(
    (clause: Lib.BreakoutClause) => {
      const nextQuery = Lib.removeClause(query, stageIndex, clause);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  const onReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceBreakouts(query, stageIndex, column);
      onQueryChange(nextQuery);
    },
    [query, stageIndex, onQueryChange],
  );

  return {
    onAddBreakout,
    onUpdateBreakout,
    onRemoveBreakout,
    onReplaceBreakouts,
  };
};
