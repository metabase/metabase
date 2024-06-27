import type { SpecificDatePickerValue } from "../../types";
import { SimpleDateRangePicker } from "../DateRangePicker";
import {
  SimpleSingleDatePicker,
  type SingleDatePickerValue,
} from "../SingleDatePicker";
import { getDate, isDateRange, setDateTime, setDateTimeRange } from "../utils";

interface SimpleSpecificDatePickerProps {
  value: SpecificDatePickerValue;
  onChange: (value: SpecificDatePickerValue) => void;
}

export function SimpleSpecificDatePicker({
  value,
  onChange,
}: SimpleSpecificDatePickerProps) {
  const handleDateChange = ({ date, hasTime }: SingleDatePickerValue) => {
    onChange(setDateTime(value, date, hasTime));
  };

  const handleDateRangeChange = (dates: [Date, Date], hasTime: boolean) => {
    onChange(setDateTimeRange(value, dates, hasTime));
  };

  return isDateRange(value.values) ? (
    <SimpleDateRangePicker
      value={value.values}
      hasTime={value.hasTime}
      onChange={handleDateRangeChange}
    />
  ) : (
    <SimpleSingleDatePicker
      value={{ date: getDate(value), hasTime: value.hasTime }}
      onChange={handleDateChange}
    />
  );
}
