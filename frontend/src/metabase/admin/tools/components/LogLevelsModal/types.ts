import type { LoggerDurationUnit } from "metabase-types/api";

// Some options are not practically useful
export type AllowedTimeUnit = Exclude<
  LoggerDurationUnit,
  "nanoseconds" | "microseconds" | "milliseconds"
>;
