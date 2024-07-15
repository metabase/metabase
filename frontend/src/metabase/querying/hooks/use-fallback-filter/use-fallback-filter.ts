import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import { getAvailableOptions, getFilterClause } from "./utils";

interface UseFallbackOperatorFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useFallbackFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseFallbackOperatorFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.fallbackFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(filterParts?.operator);

  return {
    operator,
    availableOptions,
    getFilterClause: (operator: Lib.FallbackFilterOperatorName | undefined) =>
      getFilterClause(operator, column),
    setOperator,
  };
}
