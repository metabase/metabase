import { useCallback, useMemo, useState } from "react";
import { useLatest } from "react-use";

import * as Lib from "metabase-lib";

import type { NumberValue } from "./types";
import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseNumberFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useNumberFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseNumberFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.numberFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const initialOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(query, column, availableOptions);
  }, [filterParts, query, column, availableOptions]);

  const [operator, setOperator] = useState(initialOperator);

  const initialValues = useMemo(() => {
    return getDefaultValues(operator, filterParts ? filterParts.values : []);
  }, [operator, filterParts]);

  const [values, setValues] = useState(() => initialValues);

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

  const resetRef = useLatest(() => {
    setValues(initialValues);
    setOperator(initialOperator);
  });

  const reset = useCallback(() => resetRef.current(), [resetRef]);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.NumberFilterOperator,
      values: NumberValue[],
    ) => getFilterClause(operator, column, values),
    reset,
    setOperator,
    setValues,
  };
}
