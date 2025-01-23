import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    setValues(defaultValues);
  }, [defaultValues]);

  useEffect(() => {
    const { isAdvanced } = getOptionByOperator(defaultOperator);
    setOperator(defaultOperator);
    setIsExpanded(isAdvanced);
  }, [defaultOperator]);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    isExpanded,
    getDefaultValues,
    getFilterClause: (operator: Lib.BooleanFilterOperator, values: boolean[]) =>
      getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
