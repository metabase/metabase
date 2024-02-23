import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { msgid, ngettext } from "ttag";

import type { TimeOnlyOptions } from "metabase/lib/formatting/types";
import { parseTime, parseTimestamp } from "metabase/lib/time";
import type { DatetimeUnit } from "metabase-types/api/query";

import {
  DEFAULT_TIME_STYLE,
  getTimeFormatFromStyle,
  hasHour,
} from "./datetime-utils";

export function duration(milliseconds: number) {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;

  if (milliseconds >= HOUR) {
    const hours = Math.round(milliseconds / HOUR);
    return ngettext(msgid`${hours} hour`, `${hours} hours`, hours);
  }
  if (milliseconds >= MINUTE) {
    const minutes = Math.round(milliseconds / MINUTE);
    return ngettext(msgid`${minutes} minute`, `${minutes} minutes`, minutes);
  }
  const seconds = Math.round(milliseconds / SECOND);

  return ngettext(msgid`${seconds} second`, `${seconds} seconds`, seconds);
}

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
  const m = parseTimestamp(value, unit, options.local);
  if (!m.isValid()) {
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
    : getTimeFormatFromStyle(timeStyle, unit, timeEnabled as any);

  return m.format(timeFormat);
}

export function formatTime(
  time: Moment,
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
    getTimeFormatFromStyle(timeStyle, unit, timeEnabled as any);

  return parsedTime.isValid() ? parsedTime.format(timeFormat) : String(time);
}
