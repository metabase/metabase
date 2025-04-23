import { getNextId } from "__support__/utils";

import type { LoggerPreset } from "../logger";

export function createMockLoggerPreset(
  preset?: Partial<LoggerPreset>,
): LoggerPreset {
  return {
    display_name: "Logger preset",
    id: String(getNextId()),
    loggers: [],
    ...preset,
  };
}
