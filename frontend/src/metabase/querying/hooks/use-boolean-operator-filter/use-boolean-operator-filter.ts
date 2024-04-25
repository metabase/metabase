import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import {
  getAvailableOptions,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
} from "./utils";

interface UseBooleanOperatorFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useBooleanOperatorFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseBooleanOperatorFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.booleanFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(filterParts?.operator ?? "=");
  const [values, setValues] = useState(() => filterParts?.values ?? []);
  const { valueCount, isAdvanced } = getOptionByOperator(operator);
  const [isExpanded] = useState(isAdvanced);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    isExpanded,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.BooleanFilterOperatorName,
      values: boolean[],
    ) => getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
