import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type { NumberValue } from "./types";
import {
  getAvailableOptions,
  getDefaultValues,
  getOptionByOperator,
  getFilterClause,
  isValidFilter,
  getDefaultOperator,
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

  const [operator, setOperator] = useState(() =>
    filterParts
      ? filterParts.operator
      : getDefaultOperator(column, availableOptions),
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
      operator: Lib.NumberFilterOperatorName,
      values: NumberValue[],
    ) => getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
