export type LogLevel =
  | "off"
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace";

export type LoggerDurationUnit =
  | "days"
  | "hours"
  | "minutes"
  | "seconds"
  | "milliseconds"
  | "microseconds"
  | "nanoseconds";

export type LoggerName = string;

export interface Logger {
  name: LoggerName;
  level: LogLevel;
}

export interface LoggerPreset {
  id: string;
  display_name: string;
  loggers: Logger[];
}

export interface AdjustLogLevelsRequest {
  duration: number;
  duration_unit: LoggerDurationUnit;
  log_levels: Record<LoggerName, LogLevel>;
}
