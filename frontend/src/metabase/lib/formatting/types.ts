export interface OptionsType {
  click_behavior?: any;
  clicked?: any;
  column?: any;
  compact?: boolean;
  date_abbreviate?: boolean;
  date_format?: string;
  date_separator?: string;
  date_style?: string;
  isExclude?: boolean;
  jsx?: boolean;
  link_text?: string;
  link_url?: string;
  local?: boolean;
  majorWidth?: number;
  markdown_template?: any;
  maximumFractionDigits?: number;
  noRange?: boolean;
  prefix?: string;
  remap?: any;
  rich?: boolean;
  suffix?: string;
  time_enabled?: "minutes" | "milliseconds" | "seconds" | null;
  time_format?: string;
  time_style?: string;
  type?: string;
  view_as?: string | null;
}
