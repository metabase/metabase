import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type { NumberOrEmptyValue } from "./types";
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
  filter?: Lib.Filterable;
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

  const availableOptions = useMemo(() => getAvailableOptions(column), [column]);

  const [operator, setOperator] = useState(() =>
    filterParts ? filterParts.operator : getDefaultOperator(query, column),
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

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
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
