import { useCallback, useMemo, useState } from "react";
import { useLatest } from "react-use";

import * as Lib from "metabase-lib";

import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseStringFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useStringFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseStringFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.stringFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const defaultOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(query, column, availableOptions);
  }, [filterParts, query, column, availableOptions]);

  const [operator, setOperator] = useState(defaultOperator);

  const defaultValues = useMemo(
    () => getDefaultValues(operator, filterParts ? filterParts.values : []),
    [operator, filterParts],
  );

  const [values, setValues] = useState(defaultValues);

  const defaultOptions = useMemo(() => {
    return filterParts ? filterParts.options : { caseSensitive: false };
  }, [filterParts]);

  const [options, setOptions] = useState(defaultOptions);

  const { type } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values, options);

  const resetRef = useLatest(() => {
    setValues(defaultValues);
    setOperator(defaultOperator);
    setOptions(defaultOptions);
  });
  const reset = useCallback(() => resetRef.current(), [resetRef]);

  return {
    type,
    operator,
    availableOptions,
    values,
    options,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.StringFilterOperator,
      values: string[],
      options: Lib.StringFilterOptions,
    ) => getFilterClause(operator, column, values, options),
    reset,
    setOperator,
    setValues,
    setOptions,
  };
}
