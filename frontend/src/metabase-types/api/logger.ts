export type LogLevel =
  | "off"
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace";

export type TimeUnit =
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

export interface AdjustmentPlan {
  op: "add" | "change";
  ns: string;
  from?: LogLevel;
  to: LogLevel;
}

export interface AdjustLogLevelsRequest {
  duration: number;
  duration_unit: TimeUnit;
  log_levels: Record<LoggerName, LogLevel>;
}

export interface AdjustLogLevelsResponse {
  plan: AdjustmentPlan[];
  "undo-task": string;
}
