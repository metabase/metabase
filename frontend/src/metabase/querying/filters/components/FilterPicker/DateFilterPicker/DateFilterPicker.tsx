import { useMemo } from "react";

import { DatePicker } from "metabase/querying/common/components/DatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { FilterSubmitButton } from "metabase/querying/filters/components/FilterPicker/FilterSubmitButton";
import type { FilterPickerWidgetProps } from "metabase/querying/filters/components/FilterPicker/types";
import { useDateFilter } from "metabase/querying/filters/hooks/use-date-filter";
import { PopoverBackButton } from "metabase/ui";
import * as Lib from "metabase-lib";

export function DateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  withSubmitButton,
  onChange,
  onBack,
  readOnly,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const { value, availableUnits, getFilterClause } = useDateFilter({
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
        availableUnits={availableUnits}
        renderSubmitButton={({ value, isDisabled }) => {
          if (!withSubmitButton) {
            return null;
          }

          return (
            <FilterSubmitButton
              isNew={isNew}
              isDisabled={isDisabled}
              withAddButton={withAddButton}
              onAddButtonClick={() => handleAddButtonClick(value)}
            />
          );
        }}
        renderBackButton={() =>
          onBack ? (
            <PopoverBackButton
              p="sm"
              onClick={onBack}
              disabled={readOnly}
              withArrow={!readOnly}
            >
              {columnInfo.longDisplayName}
            </PopoverBackButton>
          ) : null
        }
        onChange={handleChange}
        readOnly={readOnly}
      />
    </div>
  );
}
