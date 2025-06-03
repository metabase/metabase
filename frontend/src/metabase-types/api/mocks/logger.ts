import type { LoggerPreset } from "../logger";

export function createMockLoggerPreset(
  preset?: Partial<LoggerPreset>,
): LoggerPreset {
  return {
    display_name: "Logger preset",
    id: "1",
    loggers: [],
    ...preset,
  };
}
