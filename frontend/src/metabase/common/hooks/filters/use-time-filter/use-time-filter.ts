import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "../utils";
import type { TimePickerOperator } from "./types";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, getFilterClause } from "./utils";

type UseTimeFilterOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  defaultOperator?: TimePickerOperator;
};

export function useTimeFilter({
  query,
  stageIndex,
  column,
  filter,
  defaultOperator = "<",
}: UseTimeFilterOpts) {
  const filterParts = useMemo(() => {
    return filter ? Lib.timeFilterParts(query, stageIndex, filter) : null;
  }, [query, stageIndex, filter]);

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

  const { valueCount } = OPERATOR_OPTIONS[operator];

  const setOperator = (operator: Lib.TimeFilterOperatorName) => {
    _setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  return {
    operator,
    values,
    valueCount,
    availableOperators,
    setOperator,
    setValues,
    getFilterClause: () => getFilterClause(operator, column, values),
  };
}
