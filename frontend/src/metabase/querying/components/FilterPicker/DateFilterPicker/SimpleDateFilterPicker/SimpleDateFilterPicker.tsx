import { useMemo } from "react";
import type * as Lib from "metabase-lib";
import { SimpleDatePicker } from "metabase/querying/components/DatePicker";
import type { DatePickerValue } from "metabase/querying/components/DatePicker";
import { getFilterClause, getPickerOperators, getPickerValue } from "../utils";

interface SimpleDateFilterPickerProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
}

export function SimpleDateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: SimpleDateFilterPickerProps) {
  const value = useMemo(() => {
    return filter && getPickerValue(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  const availableOperators = useMemo(() => {
    return getPickerOperators(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const handleChange = (value: DatePickerValue | undefined) => {
    if (value) {
      onChange(getFilterClause(query, stageIndex, column, value));
    } else {
      onChange(undefined);
    }
  };

  return (
    <div data-testid="datetime-filter-picker">
      <SimpleDatePicker
        value={value}
        availableOperators={availableOperators}
        onChange={handleChange}
      />
    </div>
  );
}
