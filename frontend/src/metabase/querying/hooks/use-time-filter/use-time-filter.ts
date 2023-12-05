import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import { getAvailableOperatorOptions, getDefaultOperator } from "../utils";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, getFilterClause } from "./utils";

interface UseTimeFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange?: (filter: Lib.ExpressionClause) => void;
}

export function useTimeFilter({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: UseTimeFilterProps) {
  const filterParts = useMemo(() => {
    return filter ? Lib.timeFilterParts(query, stageIndex, filter) : null;
  }, [query, stageIndex, filter]);

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    getDefaultOperator(availableOperators, filterParts?.operator ?? "<"),
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values),
  );

  const { valueCount } = OPERATOR_OPTIONS[operator];

  const handleOperatorChange = (newOperator: Lib.TimeFilterOperatorName) => {
    const newValues = getDefaultValues(newOperator, values);
    setOperator(newOperator);
    setValues(newValues);

    if (onChange) {
      onChange(getFilterClause(newOperator, column, newValues));
    }
  };

  const handleValuesChange = (newValues: Date[]) => {
    setValues(newValues);

    if (onChange) {
      onChange(getFilterClause(operator, column, newValues));
    }
  };

  return {
    operator,
    values,
    valueCount,
    availableOperators,
    getFilterClause: () => getFilterClause(operator, column, values),
    handleOperatorChange,
    handleValuesChange,
  };
}
