import { useMemo } from "react";

import type { DatePickerValue } from "metabase/querying/components/DatePicker";
import { DatePicker } from "metabase/querying/components/DatePicker";
import { useDateFilter } from "metabase/querying/hooks/use-date-filter";
import { PopoverBackButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";

export function DateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const { value, availableOperators, availableUnits, getFilterClause } =
    useDateFilter({
      query,
      stageIndex,
      column,
      filter,
    });

  const handleChange = (value: DatePickerValue) => {
    onChange(getFilterClause(value));
  };

  return (
    <div data-testid="datetime-filter-picker">
      <DatePicker
        value={value}
        availableOperators={availableOperators}
        availableUnits={availableUnits}
        backButton={
          onBack && (
            <PopoverBackButton p="sm" onClick={onBack}>
              {columnInfo.longDisplayName}
            </PopoverBackButton>
          )
        }
        canUseRelativeOffsets
        isNew={isNew}
        onChange={handleChange}
      />
    </div>
  );
}
