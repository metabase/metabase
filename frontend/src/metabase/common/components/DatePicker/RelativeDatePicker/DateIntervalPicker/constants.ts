import type { DatePickerTruncationUnit } from "metabase/common/components/DatePicker";

export const DEFAULT_OFFSETS: Record<DatePickerTruncationUnit, number> = {
  minute: 60,
  hour: 24,
  day: 7,
  week: 4,
  month: 3,
  quarter: 4,
  year: 1,
};
