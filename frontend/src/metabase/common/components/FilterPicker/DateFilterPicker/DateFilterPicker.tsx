import { useMemo } from "react";
import { DatePicker } from "metabase/common/components/DatePicker";
import type { DatePickerValue } from "metabase/common/components/DatePicker";
import type { FilterPickerWidgetProps } from "../types";
import {
  getFilterClause,
  getPickerUnits,
  getPickerOperators,
  getPickerValue,
} from "./utils";

export function DateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
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
    <DatePicker
      value={value}
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onChange={handleChange}
    />
  );
}
