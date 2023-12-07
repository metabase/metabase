import { useMemo, useState } from "react";
import { getAvailableOperatorOptions } from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, getFilterClause, hasValidValues } from "./utils";
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

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(filterParts?.operator ?? "<");
  const [values, setValues] = useState<TimeValue[]>(() =>
    getDefaultValues(operator, filterParts?.values),
  );
  const { valueCount } = OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(values);

  const setOperatorAndValues = (newOperator: Lib.TimeFilterOperatorName) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  return {
    operator,
    values,
    valueCount,
    availableOperators,
    isValid,
    getFilterClause: (
      operator: Lib.TimeFilterOperatorName,
      values: TimeValue[],
    ) => getFilterClause(operator, column, values),
    setOperator: setOperatorAndValues,
    setValues,
  };
}
