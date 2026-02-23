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
  filter?: Lib.Filterable;
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

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(),
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
    getFilterClause: (operator: Lib.TimeFilterOperator, values: TimeValue[]) =>
      getFilterClause(operator, column, values),
    setOperator,
    setValues,
  };
}
