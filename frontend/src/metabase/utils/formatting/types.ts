export type TimeEnabled = "minutes" | "milliseconds" | "seconds";

export interface TimeOnlyOptions {
  local?: boolean;
  time_enabled?: TimeEnabled | null;
  time_format?: string;
  time_style?: string;
}
