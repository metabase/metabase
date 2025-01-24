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

  const initialOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(query, column, availableOptions);
  }, [filterParts, query, column, availableOptions]);

  const [operator, setOperator] = useState(initialOperator);

  const initialValues = useMemo(
    () => getDefaultValues(operator, filterParts ? filterParts.values : []),
    [operator, filterParts],
  );

  const [values, setValues] = useState(initialValues);

  const initialOptions = useMemo(() => {
    return filterParts ? filterParts.options : { caseSensitive: false };
  }, [filterParts]);

  const [options, setOptions] = useState(initialOptions);
  const { type } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values, options);

  const resetRef = useLatest(() => {
    setValues(initialValues);
    setOperator(initialOperator);
    setOptions(initialOptions);
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
