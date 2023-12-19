import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import {
  getAvailableOptions,
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

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : "=",
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values ?? []),
  );

  const [options, setOptions] = useState(
    filterParts ? filterParts.options : {},
  );

  const { valueCount, hasMultipleValues, hasCaseSensitiveOption } =
    getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values, options);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    hasCaseSensitiveOption,
    options,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.StringFilterOperatorName,
      values: string[],
      options: Lib.StringFilterOptions,
    ) => getFilterClause(operator, column, values, options),
    setOperator,
    setValues,
    setOptions,
  };
}
