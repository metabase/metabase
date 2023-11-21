import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "../utils";
import type { StringPickerOperator } from "./types";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, hasValidValues, getFilterClause } from "./utils";

type UseStringFilterOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  defaultOperator?: StringPickerOperator;
};

export function useStringFilter({
  query,
  stageIndex,
  column,
  filter,
  defaultOperator = "=",
}: UseStringFilterOpts) {
  const filterParts = useMemo(
    () => (filter ? Lib.stringFilterParts(query, stageIndex, filter) : null),
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

  const [options, setOptions] = useState(
    filterParts ? filterParts.options : {},
  );

  const { valueCount, hasMultipleValues, hasCaseSensitiveOption } =
    OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const setOperator = (operator: Lib.StringFilterOperatorName) => {
    _setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  return {
    operator,
    values,
    options,
    isValid,
    valueCount,
    hasMultipleValues,
    hasCaseSensitiveOption,
    availableOperators,
    setOperator,
    setValues,
    setOptions,
    getFilterClause: () => {
      if (isValid) {
        return getFilterClause(operator, column, values, options);
      }
    },
  };
}
