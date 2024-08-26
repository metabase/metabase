export interface TimeOnlyOptions {
  local?: boolean;
  time_enabled?: "minutes" | "milliseconds" | "seconds" | null;
  time_format?: string;
  time_style?: string;
}

export interface OptionsType extends TimeOnlyOptions {
  click_behavior?: any;
  clicked?: any;
  column?: any;
  column_title?: string;
  compact?: boolean;
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
  stringifyNull?: boolean;
  show_mini_bar?: boolean;
  suffix?: string;
  type?: string;
  view_as?: string | null;
  weekday_enabled?: boolean;
}
