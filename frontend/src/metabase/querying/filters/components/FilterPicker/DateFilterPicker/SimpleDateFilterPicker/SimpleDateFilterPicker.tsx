import { SimpleDatePicker } from "metabase/querying/common/components/DatePicker/SimpleDatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import type * as Lib from "metabase-lib";

import { useDateFilter } from "../../../../hooks/use-date-filter";

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
  const { value, availableUnits, getFilterClause } = useDateFilter({
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
        availableUnits={availableUnits}
        onChange={handleChange}
      />
    </div>
  );
}
