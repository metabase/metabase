export type CurrencyStyle = Intl.NumberFormatOptionsCurrencyDisplay;

export type TimeEnabled = "minutes" | "milliseconds" | "seconds";

export type DurationUnit =
  | "nanosecond"
  | "microsecond"
  | "millisecond"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week";

export type DurationStyle = "digital" | "narrow";

export interface TimeOnlyOptions {
  local?: boolean;
  time_enabled?: TimeEnabled | null;
  time_format?: string;
  time_style?: string;
}
