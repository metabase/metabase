import type {
  MetabaseLoggerApiLogLevel,
  MetabaseLoggerApiTimeUnit,
} from "metabase-types/openapi";

export type LogLevel = MetabaseLoggerApiLogLevel;

export type LoggerDurationUnit = MetabaseLoggerApiTimeUnit;

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
