import type { Dayjs } from "dayjs";

import { parseTime, parseTimestamp } from "metabase/utils/time-dayjs";
import type { TimeOnlyOptions } from "metabase-types/api";
import type { DatetimeUnit } from "metabase-types/api/query";

import {
  DEFAULT_TIME_STYLE,
  getTimeFormatFromStyle,
  hasHour,
} from "./datetime-utils";

interface TimeWithUnitType {
  local?: boolean;
  time_enabled?: "minutes" | "milliseconds" | "seconds" | boolean;
  time_format?: string;
  time_style?: string;
}

export function formatTimeWithUnit(
  value: number,
  unit: DatetimeUnit,
  options: TimeWithUnitType = {},
) {
  const d = parseTimestamp(value, unit, options.local);
  if (!d.isValid()) {
    return String(value);
  }

  const timeStyle = options.time_style
    ? options.time_style
    : DEFAULT_TIME_STYLE;

  const timeEnabled = options.time_enabled
    ? options.time_enabled
    : hasHour(unit)
      ? "minutes"
      : null;

  const timeFormat = options.time_format
    ? options.time_format
    : // Unjustified type cast. FIXME
      getTimeFormatFromStyle(timeStyle, unit, timeEnabled as any);

  return d.format(timeFormat);
}

export function formatTime(
  time: Dayjs | string,
  unit: DatetimeUnit = "default",
  options: TimeOnlyOptions = {},
) {
  const parsedTime = parseTime(time);

  const timeStyle = options.time_style ?? DEFAULT_TIME_STYLE;

  let timeEnabled;
  if (options.time_enabled) {
    timeEnabled = options.time_enabled;
  } else if (hasHour(unit)) {
    timeEnabled = "minute";
  } else {
    timeEnabled = null;
  }

  const timeFormat =
    options.time_format ??
    // Unjustified type cast. FIXME
    getTimeFormatFromStyle(timeStyle, unit, timeEnabled as any);

  return parsedTime.isValid() ? parsedTime.format(timeFormat) : String(time);
}
