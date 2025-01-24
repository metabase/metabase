import { useEffect, useMemo, useState } from "react";
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
  searchText: string;
}

export function useTimeFilter({
  query,
  stageIndex,
  column,
  filter,
  searchText,
}: UseTimeFilterProps) {
  const filterParts = useMemo(() => {
    return filter ? Lib.timeFilterParts(query, stageIndex, filter) : null;
  }, [query, stageIndex, filter]);

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const defaultOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(availableOptions);
  }, [availableOptions, filterParts]);

  const [operator, setOperator] = useState(defaultOperator);

  const defaultValues = useMemo(() => {
    return getDefaultValues(operator, filterParts ? filterParts.values : []);
  }, [operator, filterParts]);

  const [values, setValues] = useState(() => defaultValues);
  const { valueCount } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

  const resetRef = useLatest(() => {
    setValues(defaultValues);
    setOperator(defaultOperator);
  });

  useEffect(() => {
    resetRef.current();
  }, [resetRef, searchText]);

  return {
    operator,
    values,
    valueCount,
    availableOptions,
    isValid,
    getDefaultValues,
    getFilterClause: (operator: Lib.TimeFilterOperator, values: TimeValue[]) =>
      getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
