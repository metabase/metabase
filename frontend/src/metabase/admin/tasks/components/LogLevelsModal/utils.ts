import type { LoggerPreset } from "metabase-types/api";

export function getPresetJson(preset: LoggerPreset) {
  const logLevels = Object.fromEntries(
    preset.loggers.map(({ level, name }) => [name, level]),
  );
  return JSON.stringify(logLevels, null, 2);
}

export function isJsonValid(json: string): boolean {
  try {
    JSON.parse(json);
    return true;
  } catch (_error) {
    return false;
  }
}
