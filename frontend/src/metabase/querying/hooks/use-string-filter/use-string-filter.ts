import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "metabase/querying/utils/filters";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, getFilterClause, isValidFilter } from "./utils";

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

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : "=",
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values),
  );

  const [options, setOptions] = useState(
    filterParts ? filterParts.options : {},
  );

  const { valueCount, hasMultipleValues, hasCaseSensitiveOption } =
    OPERATOR_OPTIONS[operator];
  const isValid = isValidFilter(operator, column, values, options);

  const setOperatorAndValues = (operator: Lib.StringFilterOperatorName) => {
    setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  return {
    operator,
    availableOperators,
    values,
    valueCount,
    hasMultipleValues,
    hasCaseSensitiveOption,
    options,
    isValid,
    getFilterClause: (
      operator: Lib.StringFilterOperatorName,
      values: string[],
      options: Lib.StringFilterOptions,
    ) => getFilterClause(operator, column, values, options),
    setOperator: setOperatorAndValues,
    setValues,
    setOptions,
  };
}
