import type { DateRangePickerValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/DateRangePicker";
import { SimpleDateRangePicker } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/DateRangePicker/SimpleDateRangePicker";
import type { SingleDatePickerValue } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/SingleDatePicker";
import { SimpleSingleDatePicker } from "metabase/querying/common/components/DatePicker/SpecificDatePicker/SingleDatePicker/SimpleSingleDatePicker";
import {
  getDate,
  isDateRange,
  setDateTime,
  setDateTimeRange,
} from "metabase/querying/common/components/DatePicker/SpecificDatePicker/utils";
import type { SpecificDatePickerValue } from "metabase/querying/common/types";

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
