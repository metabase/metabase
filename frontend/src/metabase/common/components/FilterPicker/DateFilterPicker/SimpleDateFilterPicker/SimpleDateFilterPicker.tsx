import type * as Lib from "metabase-lib";
import { SimpleDatePicker } from "metabase/common/components/DatePicker";
import type { DatePickerValue } from "metabase/common/components/DatePicker";
import { useDateFilter } from "metabase/common/hooks/filters/use-date-filter";

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
