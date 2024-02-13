import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import {
  canPickColumns,
  getAvailableColumns,
  getAvailableOptions,
  getDefaultSecondColumn,
  getDefaultValues,
  getFilterClause,
  getOptionByOperator,
  isValidFilter,
} from "./utils";
import type { NumberValue } from "./types";

interface UseCoordinateFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  defaultOperator?: Lib.CoordinateFilterOperatorName;
}

export function useCoordinateFilter({
  query,
  stageIndex,
  column,
  filter,
  defaultOperator = "=",
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

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : defaultOperator,
  );
  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts?.values ?? []),
  );
  const [secondColumn, setSecondColumn] = useState(
    getDefaultSecondColumn(availableColumns, filterParts?.longitudeColumn),
  );

  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  const isValid = isValidFilter(operator, column, secondColumn, values);

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
      operator: Lib.CoordinateFilterOperatorName,
      secondColumn: Lib.ColumnMetadata | undefined,
      values: NumberValue[],
    ) => getFilterClause(operator, column, secondColumn, values),
    setOperator,
    setValues,
    setSecondColumn,
  };
}
