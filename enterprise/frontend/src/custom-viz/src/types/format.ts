import type { Column, RowValue } from "./data";

export type FormatValueOptions = {
  /**
   * Formatting is picked by the column's type, so number options like
   * `number_style` and `decimals` have no effect without a numeric column.
   */
  column?: Column;
  compact?: boolean;
  currency?: string;
  currency_style?: Intl.NumberFormatOptionsCurrencyDisplay;
  date_format?: string;
  date_style?: string | null;
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
