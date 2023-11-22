import { useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "../utils";
import type { NumberPickerOperator } from "./types";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, hasValidValues, getFilterClause } from "./utils";

type UseNumberFilterOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  defaultOperator?: NumberPickerOperator;
};

export function useNumberFilter({
  query,
  stageIndex,
  column,
  filter,
  defaultOperator = "=",
}: UseNumberFilterOpts) {
  const previousFilter = usePrevious(filter);

  const filterParts = useMemo(
    () => (filter ? Lib.numberFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, _setOperator] = useState(
    filterParts ? filterParts.operator : defaultOperator,
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values),
  );

  useEffect(() => {
    if (previousFilter && !filter) {
      _setOperator(defaultOperator);
      setValues(getDefaultValues(defaultOperator));
    }
  }, [filter, previousFilter, defaultOperator]);

  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const setOperator = (operator: Lib.NumberFilterOperatorName) => {
    _setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  return {
    operator,
    values,
    isValid,
    valueCount,
    hasMultipleValues,
    availableOperators,
    setOperator,
    setValues,
    getFilterClause: () => {
      if (isValid) {
        return getFilterClause(operator, column, values);
      }
    },
  };
}
