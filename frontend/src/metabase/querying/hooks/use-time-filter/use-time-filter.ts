import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import {
  getAvailableOptions,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";
import type { TimeValue } from "./types";

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

  const [operator, setOperator] = useState(filterParts?.operator ?? "<");
  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values),
  );
  const { valueCount } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, values);

  const setOperatorAndValues = (newOperator: Lib.TimeFilterOperatorName) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  return {
    operator,
    values,
    valueCount,
    availableOptions,
    isValid,
    getFilterClause: (
      operator: Lib.TimeFilterOperatorName,
      values: TimeValue[],
    ) => getFilterClause(operator, column, values),
    setOperator: setOperatorAndValues,
    setValues,
  };
}
