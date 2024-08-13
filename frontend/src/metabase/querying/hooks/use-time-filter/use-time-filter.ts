import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type { TimeValue } from "./types";
import {
  getAvailableOptions,
  getDefaultOperator,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseTimeFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useTimeFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseTimeFilterProps) {
  const filterParts = useMemo(() => {
    return filter ? Lib.timeFilterParts(query, stageIndex, filter) : null;
  }, [query, stageIndex, filter]);

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(availableOptions),
  );
  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const { valueCount } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

  return {
    operator,
    values,
    valueCount,
    availableOptions,
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.TimeFilterOperatorName,
      values: TimeValue[],
    ) => getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
