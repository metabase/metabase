import type { DateRangeValue } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import { dayjs } from "metabase/dayjs";
import { getFormattedDate } from "metabase/ui";

export interface FormatDateOptions {
  format?: string;
}

export interface FormatDateRangeOptions extends FormatDateOptions {
  separator?: string;
}

const DEFAULT_FORMAT = "MMMM D, YYYY";
const DEFAULT_SEPARATOR = "–";

const locale = () => dayjs().locale();

const isDate = (value: string | null | undefined): value is string =>
  !!value && dayjs(value).isValid();

export const formatDate = (
  value: string | null | undefined,
  { format = DEFAULT_FORMAT }: FormatDateOptions = {},
): string =>
  isDate(value)
    ? getFormattedDate({
        type: "default",
        date: value,
        locale: locale(),
        format,
        labelSeparator: DEFAULT_SEPARATOR,
      })
    : "";

export const formatDateRange = (
  value: DateRangeValue | null | undefined,
  {
    format = DEFAULT_FORMAT,
    separator = DEFAULT_SEPARATOR,
  }: FormatDateRangeOptions = {},
): string => {
  const [start, end] = value ?? [null, null];

  return getFormattedDate({
    type: "range",
    date: [isDate(start) ? start : null, isDate(end) ? end : null],
    locale: locale(),
    format,
    labelSeparator: separator,
  });
};
