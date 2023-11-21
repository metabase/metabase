import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";
import { getAvailableOperatorOptions } from "../utils";
import type { CoordinatePickerOperator } from "./types";
import { OPERATOR_OPTIONS } from "./constants";
import {
  canPickColumns,
  getAvailableColumns,
  getDefaultSecondColumn,
  getDefaultValues,
  getFilterClause,
  hasValidValues,
} from "./utils";

type UseCoordinateFilterOpts = {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  defaultOperator?: CoordinatePickerOperator;
};

export function useCoordinateFilter({
  query,
  stageIndex,
  column,
  filter,
  defaultOperator = "=",
}: UseCoordinateFilterOpts) {
  const filterParts = useMemo(
    () =>
      filter ? Lib.coordinateFilterParts(query, stageIndex, filter) : null,
    [query, stageIndex, filter],
  );

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const availableColumns = useMemo(
    () => getAvailableColumns(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, _setOperator] = useState(
    filterParts ? filterParts.operator : defaultOperator,
  );

  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts?.values),
  );

  const [secondColumn, setSecondColumn] = useState(
    getDefaultSecondColumn(availableColumns, filterParts?.longitudeColumn),
  );

  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const setOperator = (operator: Lib.CoordinateFilterOperatorName) => {
    _setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  return {
    operator,
    values,
    secondColumn,
    isValid,
    valueCount,
    hasMultipleValues,
    availableOperators,
    availableColumns,
    canPickColumns: canPickColumns(operator, availableColumns),
    setOperator,
    setSecondColumn,
    setValues,
    getFilterClause: () => {
      if (isValid) {
        return getFilterClause(operator, column, secondColumn, values);
      }
    },
  };
}
