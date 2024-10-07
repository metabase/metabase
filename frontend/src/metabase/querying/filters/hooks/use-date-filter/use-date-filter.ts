import { useMemo } from "react";

import type * as Lib from "metabase-lib";

import type { DatePickerValue } from "../../components/DatePicker";

import {
  getFilterClause,
  getPickerOperators,
  getPickerUnits,
  getPickerValue,
} from "./utils";

interface UseDateFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

export function useDateFilter({
  query,
  stageIndex,
  column,
  filter,
}: UseDateFilterProps) {
  const value = useMemo(() => {
    return filter && getPickerValue(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  const availableOperators = useMemo(() => {
    return getPickerOperators(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const availableUnits = useMemo(() => {
    return getPickerUnits(query, stageIndex, column);
  }, [query, stageIndex, column]);

  return {
    value,
    availableOperators,
    availableUnits,
    getFilterClause: (value: DatePickerValue) =>
      getFilterClause(query, stageIndex, column, value),
  };
}
