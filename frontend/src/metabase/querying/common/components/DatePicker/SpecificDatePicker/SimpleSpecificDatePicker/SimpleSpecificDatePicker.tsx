import type { SpecificDatePickerValue } from "metabase/querying/filters/types";

import type { DateRangePickerValue } from "../DateRangePicker";
import { SimpleDateRangePicker } from "../DateRangePicker/SimpleDateRangePicker";
import type { SingleDatePickerValue } from "../SingleDatePicker";
import { SimpleSingleDatePicker } from "../SingleDatePicker/SimpleSingleDatePicker";
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

  const handleDateRangeChange = ({
    dateRange,
    hasTime,
  }: DateRangePickerValue) => {
    onChange(setDateTimeRange(value, dateRange, hasTime));
  };

  return isDateRange(value.values) ? (
    <SimpleDateRangePicker
      value={{ dateRange: value.values, hasTime: value.hasTime }}
      onChange={handleDateRangeChange}
    />
  ) : (
    <SimpleSingleDatePicker
      value={{ date: getDate(value), hasTime: value.hasTime }}
      onChange={handleDateChange}
    />
  );
}
