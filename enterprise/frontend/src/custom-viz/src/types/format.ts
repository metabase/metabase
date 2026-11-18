import type { Column, RowValue } from "./data";

export type FormatValueOptions = {
  column?: Column;
  compact?: boolean;
  currency?: string;
  currency_style?: Intl.NumberFormatOptionsCurrencyDisplay;
  date_format?: string;
  date_style?: string | null;
  date_separator?: string;
  date_abbreviate?: boolean;
  decimals?: number;
  duration_precision?:
    | "nanosecond"
    | "microsecond"
    | "millisecond"
    | "second"
    | "minute"
    | "hour"
    | "day"
    | "week";
  duration_style?: "digital" | "narrow";
  duration_unit?:
    | "nanosecond"
    | "microsecond"
    | "millisecond"
    | "second"
    | "minute"
    | "hour"
    | "day"
    | "week";
  number_style?: string;
  number_separators?: string;
  prefix?: string;
  suffix?: string;
  scale?: number;
  negativeInParentheses?: boolean;
  time_enabled?: "minutes" | "milliseconds" | "seconds" | null;
  time_style?: string;
};

export type FormatValue = (
  value: RowValue,
  options?: FormatValueOptions,
) => string;
