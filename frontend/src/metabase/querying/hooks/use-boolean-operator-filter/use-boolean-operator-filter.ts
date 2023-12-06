import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import {
  getAvailableOperatorOptions,
  getDefaultOperator,
} from "../use-filter-operator";
import { OPERATOR_OPTIONS } from "./constants";
import { getFilterClause } from "./utils";

interface UseBooleanOperatorFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useBooleanOperatorFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseBooleanOperatorFilterProps) {
  const filterParts = useMemo(
    () => (filter ? Lib.booleanFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    getDefaultOperator(availableOperators, filterParts?.operator ?? "="),
  );

  const [values, setValues] = useState(() => filterParts?.values ?? []);
  const { valueCount } = OPERATOR_OPTIONS[operator];
  const [isExpanded] = useState(valueCount === 0);

  const setOperatorAndValues = (newOperator: Lib.BooleanFilterOperatorName) => {
    setOperator(newOperator);
    setValues([]);
  };

  return {
    operator,
    availableOperators,
    values,
    isExpanded,
    getFilterClause: (
      operator: Lib.BooleanFilterOperatorName,
      values: boolean[],
    ) => getFilterClause(operator, column, values),
    setOperator: setOperatorAndValues,
    setValues,
  };
}
