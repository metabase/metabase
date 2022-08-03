import { msgid, ngettext } from "ttag";
import { parseTime } from "metabase/lib/time";
import { Moment } from "moment-timezone";

import type { Value } from "metabase-types/types/Dataset";

export function duration(milliseconds) {
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

export function formatTime(time: Moment) {
  const parsedTime = parseTime(time);

  return parsedTime.isValid() ? parsedTime.format("LT") : String(time);
}

export function formatTimeWithUnit(value, unit, options = {}) {
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
    : getTimeFormatFromStyle(timeStyle, unit, timeEnabled);

  return m.format(timeFormat);
}
