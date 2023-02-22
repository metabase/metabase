import {
  format_strings_js,
  known_date_styles_js,
  known_datetime_styles_js,
  known_time_styles_js,
} from "cljs/metabase.shared.formatting.constants";

// These correspond to the maps of known date-style and time-style values in
// in metabase.shared.formatting.internal.date-formatting
type KnownDateFormats = keyof typeof known_date_styles_js;
type KnownDateTimeFormats = keyof typeof known_datetime_styles_js;
type KnownTimeFormats = keyof typeof known_time_styles_js;

// This corresponds to the map of format strings in metabase.shared.formatting.internal.date-builder
type FormatKey = keyof typeof format_strings_js;

type FormatList = [FormatKey | [string]];

export interface OptionsType {
  click_behavior?: any;
  clicked?: any;
  column?: any;
  compact?: boolean;
  date_abbreviate?: boolean;
  date_format?: KnownDateFormats | KnownDateTimeFormats | FormatList;
  date_separator?: string;
  date_style?: KnownDateFormats | KnownDateTimeFormats | FormatList;
  decimals?: number;
  isExclude?: boolean;
  jsx?: boolean;
  link_text?: string;
  link_url?: string;
  local?: boolean;
  majorWidth?: number;
  markdown_template?: any;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  noRange?: boolean;
  number_separators?: string;
  number_style?: string;
  prefix?: string;
  remap?: any;
  rich?: boolean;
  suffix?: string;
  time_enabled?: "minutes" | "milliseconds" | "seconds" | null;
  time_format?: KnownTimeFormats | FormatList;
  time_style?: KnownTimeFormats;
  type?: string;
  view_as?: string | null;
  weekday_enabled?: boolean;
}
