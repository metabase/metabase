import type { DateRangeValue } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";

export interface FormatDateRangeOptions {
  /** BCP 47 tag. Defaults to the runtime's locale. */
  locale?: string;
  format?: Intl.DateTimeFormatOptions;
  /** Placed between the two ends. Defaults to an en dash with spaces. */
  separator?: string;
}

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const DEFAULT_SEPARATOR = " – ";

const DATE_STRING_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` to a local-time `Date`. Not `new Date(value)`: a date-only ISO
 * string parses as UTC, so it displays as the previous day anywhere west of
 * Greenwich.
 */
export const parseDateString = (value: string): Date | null => {
  const match = DATE_STRING_RE.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);

  // The constructor normalizes out-of-range parts rather than failing, so
  // `2026-02-31` would come back as March 3. Only a round-trip proves it valid.
  const isSameDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isSameDate ? date : null;
};

export const formatDate = (
  value: string | null | undefined,
  { locale, format = DEFAULT_FORMAT }: FormatDateRangeOptions = {},
): string => {
  const date = value ? parseDateString(value) : null;

  return date ? new Intl.DateTimeFormat(locale, format).format(date) : "";
};

/**
 * Label for a `[start, end]` range of `YYYY-MM-DD` strings, in the three states
 * the calendar produces: both ends, start only (`"Sep 1, 2026 – "`), or neither
 * (`""`). Meant for the trigger a data app renders in front of `DateRangePopover`.
 */
export const formatDateRange = (
  value: DateRangeValue | null | undefined,
  options: FormatDateRangeOptions = {},
): string => {
  const { separator = DEFAULT_SEPARATOR } = options;
  const [start, end] = value ?? [null, null];
  const from = formatDate(start, options);
  const to = formatDate(end, options);

  if (from && to) {
    return `${from}${separator}${to}`;
  }

  return from ? `${from}${separator}` : "";
};
