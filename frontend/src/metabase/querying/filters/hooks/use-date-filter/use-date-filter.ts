import { useMemo } from "react";

import type { DatePickerValue } from "metabase/querying/filters/types";
import {
  getDateFilterClause,
  getDatePickerOperators,
  getDatePickerUnits,
  getDatePickerValue,
} from "metabase/querying/filters/utils/dates";
import type * as Lib from "metabase-lib";

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
    return filter && getDatePickerValue(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  const availableOperators = useMemo(() => {
    return getDatePickerOperators(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const availableUnits = useMemo(() => {
    return getDatePickerUnits(query, stageIndex, column);
  }, [query, stageIndex, column]);

  return {
    value,
    availableOperators,
    availableUnits,
    getFilterClause: (value: DatePickerValue) =>
      getDateFilterClause(column, value),
  };
}
