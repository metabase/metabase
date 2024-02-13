import type { SpecificDatePickerValue } from "../../types";
import { getDate, isDateRange, setDate, setDateRange } from "../utils";
import { SimpleDateRangePicker } from "../DateRangePicker";
import { SimpleSingleDatePicker } from "../SingleDatePicker";

interface SimpleSpecificDatePickerProps {
  value: SpecificDatePickerValue;
  onChange: (value: SpecificDatePickerValue) => void;
}

export function SimpleSpecificDatePicker({
  value,
  onChange,
}: SimpleSpecificDatePickerProps) {
  const handleDateChange = (date: Date) => {
    onChange(setDate(value, date));
  };

  const handleDateRangeChange = (dates: [Date, Date]) => {
    onChange(setDateRange(value, dates));
  };

  return isDateRange(value.values) ? (
    <SimpleDateRangePicker
      value={value.values}
      onChange={handleDateRangeChange}
    />
  ) : (
    <SimpleSingleDatePicker
      value={getDate(value)}
      onChange={handleDateChange}
    />
  );
}
