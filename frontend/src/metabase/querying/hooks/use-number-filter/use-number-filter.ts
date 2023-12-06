import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import {
  getAvailableOperatorOptions,
  getDefaultOperator,
} from "../use-filter-operator";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, getFilterClause, hasValidValues } from "./utils";
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

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    getDefaultOperator(
      availableOperators,
      filterParts?.operator ?? defaultOperator,
    ),
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values),
  );

  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const setOperatorAndValues = (newOperator: Lib.NumberFilterOperatorName) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  return {
    operator,
    availableOperators,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getFilterClause: (
      operator: Lib.NumberFilterOperatorName,
      values: NumberValue[],
    ) => getFilterClause(operator, column, values),
    setOperator: setOperatorAndValues,
    setValues,
  };
}
