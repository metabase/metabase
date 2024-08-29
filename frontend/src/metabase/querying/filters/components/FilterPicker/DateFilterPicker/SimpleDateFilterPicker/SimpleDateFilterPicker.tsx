import type { DatePickerValue } from "metabase/querying/filters/components/DatePicker";
import { SimpleDatePicker } from "metabase/querying/filters/components/DatePicker/SimpleDatePicker";
import { useDateFilter } from "metabase/querying/filters/hooks/use-date-filter";
import type * as Lib from "metabase-lib";

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
  const { value, availableOperators, getFilterClause } = useDateFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleChange = (value: DatePickerValue | undefined) => {
    if (value) {
      onChange(getFilterClause(value));
    } else {
      onChange(undefined);
    }
  };

  return (
    <div data-testid="date-filter-picker">
      <SimpleDatePicker
        value={value}
        availableOperators={availableOperators}
        onChange={handleChange}
      />
    </div>
  );
}
