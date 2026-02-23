import { useMemo, useState } from "react";

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
  filter?: Lib.Filterable;
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

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(hasInitialOperator),
  );

  return {
    operator,
    availableOptions,
    getFilterClause: (operator: Lib.DefaultFilterOperator | undefined) =>
      getFilterClause(operator, column),
    setOperator,
  };
}
