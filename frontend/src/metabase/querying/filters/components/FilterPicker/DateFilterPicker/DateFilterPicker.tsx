import { useMemo } from "react";

import { useDateFilter } from "metabase/querying/filters/hooks/use-date-filter";
import type { DatePickerValue } from "metabase/querying/filters/types";
import { PopoverBackButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import { DatePicker } from "../../DatePicker";
import { FilterSubmitButton } from "../FilterSubmitButton";
import type { FilterPickerWidgetProps } from "../types";

export function DateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
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
    onChange(getFilterClause(value), { run: true });
  };

  const handleAddButtonClick = (value: DatePickerValue) => {
    onChange(getFilterClause(value), { run: false });
  };

  return (
    <div data-testid="date-filter-picker">
      <DatePicker
        value={value}
        availableOperators={availableOperators}
        availableUnits={availableUnits}
        renderSubmitButton={({ value, isDisabled }) => (
          <FilterSubmitButton
            isNew={isNew}
            isDisabled={isDisabled}
            withAddButton={withAddButton}
            onAddButtonClick={() => handleAddButtonClick(value)}
          />
        )}
        renderBackButton={() =>
          onBack ? (
            <PopoverBackButton p="sm" onClick={onBack}>
              {columnInfo.longDisplayName}
            </PopoverBackButton>
          ) : null
        }
        onChange={handleChange}
      />
    </div>
  );
}
