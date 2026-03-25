import type { Column, RowValue } from "./data";

export type FormatValueOptions = {
  column?: Column;
  compact?: boolean;
  currency?: string;
  currency_style?: string;
  date_format?: string;
  date_style?: string;
  date_separator?: string;
  date_abbreviate?: boolean;
  decimals?: number;
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
