import { useMemo } from "react";

import { DatePicker } from "metabase/querying/common/components/DatePicker";
import { SimpleDatePicker } from "metabase/querying/common/components/DatePicker/SimpleDatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { PopoverBackButton } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterSubmitButton } from "../FilterSubmitButton";
import type { FilterPickerWidgetProps } from "../types";

import { useDateFilter } from "./hooks";

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
