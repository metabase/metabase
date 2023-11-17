import { useMemo } from "react";
import type { DatePickerValue } from "metabase/common/components/DatePicker";
import { DatePicker } from "metabase/common/components/DatePicker";
import * as Lib from "metabase-lib";
import { BackButton } from "../BackButton";
import type { FilterPickerWidgetProps } from "../types";
import {
  getFilterClause,
  getPickerOperators,
  getPickerUnits,
  getPickerValue,
} from "./utils";

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

  const value = useMemo(() => {
    return filter && getPickerValue(query, stageIndex, filter);
  }, [query, stageIndex, filter]);

  const availableOperators = useMemo(() => {
    return getPickerOperators(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const availableUnits = useMemo(() => {
    return getPickerUnits(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const handleChange = (value: DatePickerValue) => {
    onChange(getFilterClause(query, stageIndex, column, value));
  };

  return (
    <div data-testid="datetime-filter-picker">
      <DatePicker
        value={value}
        availableOperators={availableOperators}
        availableUnits={availableUnits}
        backButton={
          onBack && (
            <BackButton pl="sm" onClick={onBack}>
              {columnInfo.longDisplayName}
            </BackButton>
          )
        }
        canUseRelativeOffsets
        isNew={isNew}
        onChange={handleChange}
      />
    </div>
  );
}
