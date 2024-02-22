import type { DatePickerValue } from "metabase/querying/components/DatePicker";
import { SimpleDatePicker } from "metabase/querying/components/DatePicker";
import { useDateFilter } from "metabase/querying/hooks/use-date-filter";
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
    <div data-testid="datetime-filter-picker">
      <SimpleDatePicker
        value={value}
        availableOperators={availableOperators}
        onChange={handleChange}
      />
    </div>
  );
}
