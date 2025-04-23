import { t } from "ttag";

import type { LoggerPreset } from "metabase-types/api";
import {
  isErrorWithMessageResponse,
  isFormErrorResponse,
} from "metabase-types/guards";

export function getPresetJson(preset: LoggerPreset) {
  const logLevels = Object.fromEntries(
    preset.loggers.map(({ level, name }) => [name, level]),
  );
  return JSON.stringify(logLevels, null, 2);
}

export function getLogLevelsErrorMessage(response: unknown) {
  if (isFormErrorResponse(response) && response.data.errors.log_levels) {
    return response.data.errors.log_levels;
  }

  return getErrorMessage(response);
}

export function getErrorMessage(response: unknown) {
  if (isErrorWithMessageResponse(response)) {
    return response.data.message;
  }

  return t`Server error encountered`;
}

export function isJsonValid(json: string): boolean {
  try {
    JSON.parse(json);
    return true;
  } catch (_error) {
    return false;
  }
}
