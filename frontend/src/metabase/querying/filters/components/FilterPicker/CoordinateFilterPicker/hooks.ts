import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type { NumberOrEmptyValue } from "./types";
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
  filter?: Lib.Filterable;
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

  const availableOptions = useMemo(() => getAvailableOptions(), []);

  const availableColumns = useMemo(
    () => getAvailableColumns(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : getDefaultOperator(),
  );
  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts ? filterParts.values : []),
  );
  const [secondColumn, setSecondColumn] = useState(
    getDefaultSecondColumn(availableColumns, filterParts),
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
      operator: Lib.CoordinateFilterOperator,
      secondColumn: Lib.ColumnMetadata | undefined,
      values: NumberOrEmptyValue[],
    ) => getFilterClause(operator, column, secondColumn, values),
    setOperator,
    setValues,
    setSecondColumn,
  };
}
