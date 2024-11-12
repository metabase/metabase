import { useCallback } from "react";

import * as Lib from "metabase-lib";

import { STAGE_INDEX } from "./constants";
import type { UpdateQueryHookProps } from "./types";

export const useBreakoutQuery = ({
  query,
  onQueryChange,
}: UpdateQueryHookProps) => {
  const handleAddBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.breakout(query, STAGE_INDEX, column);
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleUpdateBreakout = useCallback(
    (clause: Lib.BreakoutClause, column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceClause(query, STAGE_INDEX, clause, column);
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleRemoveBreakout = useCallback(
    (clause: Lib.BreakoutClause) => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, clause);
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );

  const handleReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      const nextQuery = Lib.replaceBreakouts(query, STAGE_INDEX, column);
      onQueryChange(nextQuery);
    },
    [query, onQueryChange],
  );
  return {
    stageIndex: STAGE_INDEX,
    handleAddBreakout,
    handleUpdateBreakout,
    handleRemoveBreakout,
    handleReplaceBreakouts,
  };
};
