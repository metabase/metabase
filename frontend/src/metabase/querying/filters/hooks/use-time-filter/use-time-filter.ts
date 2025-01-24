import { useCallback, useMemo, useState } from "react";
import { useLatest } from "react-use";

import * as Lib from "metabase-lib";

import type { TimeValue } from "./types";
import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseTimeFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useTimeFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseTimeFilterProps) {
  const filterParts = useMemo(() => {
    return filter ? Lib.timeFilterParts(query, stageIndex, filter) : null;
  }, [query, stageIndex, filter]);

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const initialOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(availableOptions);
  }, [availableOptions, filterParts]);

  const [operator, setOperator] = useState(initialOperator);

  const initialValues = useMemo(() => {
    return getDefaultValues(operator, filterParts ? filterParts.values : []);
  }, [operator, filterParts]);

  const [values, setValues] = useState(() => initialValues);
  const { valueCount } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

  const resetRef = useLatest(() => {
    setValues(initialValues);
    setOperator(initialOperator);
  });

  const reset = useCallback(() => resetRef.current(), [resetRef]);

  return {
    operator,
    values,
    valueCount,
    availableOptions,
    isValid,
    getDefaultValues,
    getFilterClause: (operator: Lib.TimeFilterOperator, values: TimeValue[]) =>
      getFilterClause(operator, column, values),
    reset,
    setOperator,
    setValues,
  };
}
