import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import {
  getAvailableOptions,
  getDefaultValues,
  getOptionByOperator,
  getFilterClause,
  isValidFilter,
} from "./utils";
import type { NumberValue } from "./types";

interface UseNumberFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  defaultOperator?: Lib.NumberFilterOperatorName;
}

export function useNumberFilter({
  query,
  stageIndex,
  column,
  filter,
  defaultOperator = "=",
}: UseNumberFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.numberFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts?.operator ?? defaultOperator,
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values ?? []),
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
