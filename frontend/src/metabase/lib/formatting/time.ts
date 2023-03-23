import { msgid, ngettext } from "ttag";
import { Moment } from "moment-timezone";
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

export function fullDuration(milliseconds: number) {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;

  let text = [];
  if (milliseconds >= HOUR) {
    const hours = Math.round(milliseconds / HOUR);
    text.push(ngettext(msgid`${hours} hr`, `${hours} hrs`, hours));
    milliseconds -= hours * HOUR;
  }
  if (milliseconds >= MINUTE) {
    const minutes = Math.round(milliseconds / MINUTE);
    text.push(ngettext(msgid`${minutes} min`, `${minutes} mins`, minutes)) ;
    milliseconds -= minutes * MINUTE;
  }
  if (milliseconds >= SECOND) {
    const seconds = Math.round(milliseconds / SECOND);
    text.push(ngettext(msgid`${seconds} s`, `${seconds} s`, seconds));
    milliseconds -= seconds * SECOND;
  }
  if (milliseconds > 0) {
    text.push(ngettext(msgid`${milliseconds} ms`, `${milliseconds} ms`, milliseconds));
  }

  return text.join(' ');
}

export function formatTime(time: Moment) {
  const parsedTime = parseTime(time);

  return parsedTime.isValid() ? parsedTime.format("LT") : String(time);
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
