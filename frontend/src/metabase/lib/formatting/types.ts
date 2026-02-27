import type { ClickBehavior } from "metabase-types/api";

import type { CurrencyStyle } from "./currency";

export type TimeEnabled = "minutes" | "milliseconds" | "seconds";

export interface TimeOnlyOptions {
  local?: boolean;
  time_enabled?: TimeEnabled | null;
  time_format?: string;
  time_style?: string;
}

export interface OptionsType extends TimeOnlyOptions {
  click_behavior?: ClickBehavior;
  clicked?: any;
  collapseNewlines?: boolean;
  column?: any;
  column_title?: string;
  compact?: boolean;
  currency?: string;
  currency_style?: CurrencyStyle;
  date_abbreviate?: boolean;
  date_format?: string;
  date_separator?: string;
  date_style?: string;
  decimals?: number;
  isExclude?: boolean;
  jsx?: boolean;
  link_text?: string;
  link_url?: string;
  majorWidth?: number;
  markdown_template?: any;
  maximumFractionDigits?: number;
  negativeInParentheses?: boolean;
  noRange?: boolean;
  number_separators?: string;
  number_style?: string;
  prefix?: string;
  remap?: any;
  removeDay?: boolean;
  removeYear?: boolean;
  rich?: boolean;
  scale?: number;
  show_mini_bar?: boolean;
  stringifyNull?: boolean;
  suffix?: string;
  type?: string;
  view_as?: string | null;
  weekday_enabled?: boolean;
}
