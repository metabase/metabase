import { useMemo } from "react";

import type { DatePickerValue } from "metabase/querying/common/types";
import type * as Lib from "metabase-lib";

import {
  getDateFilterClause,
  getDatePickerUnits,
  getDatePickerValue,
} from "../../utils/dates";

interface UseDateFilterProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
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
  const availableUnits = useMemo(() => {
    return getDatePickerUnits(query, stageIndex, column);
  }, [query, stageIndex, column]);

  return {
    value,
    availableUnits,
    getFilterClause: (value: DatePickerValue) =>
      getDateFilterClause(column, value),
  };
}
