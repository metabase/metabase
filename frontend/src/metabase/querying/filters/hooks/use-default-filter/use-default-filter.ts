import { useCallback, useMemo, useState } from "react";
import { useLatest } from "react-use";

import * as Lib from "metabase-lib";

import {
  getAvailableOptions,
  getDefaultOperator,
  getFilterClause,
} from "./utils";

interface UseDefaultFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  hasInitialOperator?: boolean;
}

export function useDefaultFilter({
  query,
  stageIndex,
  column,
  filter,
  hasInitialOperator = false,
}: UseDefaultFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.defaultFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const initialOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(availableOptions, hasInitialOperator);
  }, [filterParts, hasInitialOperator, availableOptions]);

  const [operator, setOperator] = useState(initialOperator);

  const resetRef = useLatest(() => {
    setOperator(initialOperator);
  });

  const reset = useCallback(() => resetRef.current(), [resetRef]);

  return {
    operator,
    availableOptions,
    getFilterClause: (operator: Lib.DefaultFilterOperator | undefined) =>
      getFilterClause(operator, column),
    reset,
    setOperator,
  };
}
