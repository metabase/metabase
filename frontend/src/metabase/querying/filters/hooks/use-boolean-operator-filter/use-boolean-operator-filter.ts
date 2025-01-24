import { useCallback, useMemo, useState } from "react";
import { useLatest } from "react-use";

import * as Lib from "metabase-lib";

import {
  getAvailableOptions,
  getDefaultOperator,
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

  const defaultOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(availableOptions);
  }, [filterParts, availableOptions]);

  const [operator, setOperator] = useState(defaultOperator);

  const defaultValues = useMemo(() => {
    return filterParts ? filterParts.values : [];
  }, [filterParts]);

  const [values, setValues] = useState(defaultValues);
  const { valueCount, isAdvanced } = getOptionByOperator(operator);
  const [isExpanded, setIsExpanded] = useState(isAdvanced);

  const resetRef = useLatest(() => {
    setValues(defaultValues);
    const { isAdvanced } = getOptionByOperator(defaultOperator);
    setOperator(defaultOperator);
    setIsExpanded(isAdvanced);
  });
  const reset = useCallback(() => resetRef.current(), [resetRef]);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    isExpanded,
    getDefaultValues,
    getFilterClause: (operator: Lib.BooleanFilterOperator, values: boolean[]) =>
      getFilterClause(operator, column, values),
    reset,
    setOperator,
    setValues,
  };
}
