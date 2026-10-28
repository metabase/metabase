import dayjs from "dayjs";

import type { DateRangeValue } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import type {
  FormatDateOptions,
  FormatDateRangeOptions,
} from "embedding-sdk-bundle/lib/format-date-range";

const DEFAULT_DATE_FORMAT = "MMMM D, YYYY";
const DEFAULT_DATE_RANGE_SEPARATOR = "–";

export function formatDate(
  value: string | null | undefined,
  { format = DEFAULT_DATE_FORMAT }: FormatDateOptions = {},
): string {
  if (value == null) {
    return "";
  }

  const date = dayjs(value);
  return date.isValid() ? date.format(format) : "";
}

export function formatDateRange(
  value: DateRangeValue | null | undefined,
  {
    format = DEFAULT_DATE_FORMAT,
    separator = DEFAULT_DATE_RANGE_SEPARATOR,
  }: FormatDateRangeOptions = {},
): string {
  return (value ?? [])
    .map((date) => formatDate(date, { format }))
    .filter((label) => label !== "")
    .join(separator);
}
