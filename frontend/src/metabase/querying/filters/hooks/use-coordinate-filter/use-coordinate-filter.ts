import { useCallback, useMemo, useState } from "react";
import { useLatest } from "react-use";

import * as Lib from "metabase-lib";

import type { NumberValue } from "./types";
import {
  canPickColumns,
  getAvailableColumns,
  getAvailableOptions,
  getDefaultOperator,
  getDefaultSecondColumn,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";

interface UseCoordinateFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useCoordinateFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseCoordinateFilterProps) {
  const filterParts = useMemo(
    () =>
      filter ? Lib.coordinateFilterParts(query, stageIndex, filter) : null,
    [query, stageIndex, filter],
  );

  const availableOptions = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const availableColumns = useMemo(
    () => getAvailableColumns(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const initialOperator = useMemo(() => {
    return filterParts
      ? filterParts.operator
      : getDefaultOperator(availableOptions);
  }, [availableOptions, filterParts]);

  const [operator, setOperator] = useState(initialOperator);

  const initialValues = useMemo(() => {
    return getDefaultValues(operator, filterParts ? filterParts.values : []);
  }, [operator, filterParts]);

  const [values, setValues] = useState(initialValues);

  const initialSecondColumn = useMemo(
    () => getDefaultSecondColumn(availableColumns, filterParts),
    [availableColumns, filterParts],
  );

  const [secondColumn, setSecondColumn] = useState(initialSecondColumn);

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, secondColumn, values);

  const resetRef = useLatest(() => {
    setOperator(initialOperator);
    setValues(initialValues);
    setSecondColumn(initialSecondColumn);
  });

  const reset = useCallback(() => resetRef.current(), [resetRef]);

  return {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    availableColumns,
    secondColumn,
    canPickColumns: canPickColumns(operator, availableColumns),
    isValid,
    getDefaultValues,
    getFilterClause: (
      operator: Lib.CoordinateFilterOperator,
      secondColumn: Lib.ColumnMetadata | undefined,
      values: NumberValue[],
    ) => getFilterClause(operator, column, secondColumn, values),
    reset,
    setOperator,
    setValues,
    setSecondColumn,
  };
}
