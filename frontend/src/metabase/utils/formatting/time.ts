import dayjs, { type Dayjs } from "dayjs";
import { msgid, ngettext, t } from "ttag";

import type { TimeOnlyOptions } from "metabase/utils/formatting/types";
import { parseTime, parseTimestamp } from "metabase/utils/time-dayjs";
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

/**
 * Human-readable duration formatter.
 *
 * Ladder:
 *   < 1s     → "Nms"    (e.g. "750ms")
 *   < 1min   → "N.Ms"   (e.g. "8.4s")
 *   < 1hr    → "Xm Ys"  (e.g. "8m 42s")
 *   ≥ 1hr    → "Xh Ym"  (e.g. "2h 17m")
 *
 * Negative inputs (defensive — e.g. clock skew between FE and DB) clamp to 0ms.
 *
 * Uses dayjs.duration internally for component decomposition (the duration
 * plugin is already extended globally at frontend/src/metabase/utils/dayjs.ts),
 * but NOT its .format("HH:mm:ss") because that produces clock-style output
 * rather than the readable ladder we want.
 */
export function formatDurationLong(durationMs: number): string {
  if (durationMs <= 0) {
    return t`0ms`;
  }
  if (durationMs < 1_000) {
    const ms = Math.round(durationMs);
    return t`${ms}ms`;
  }
  // Round to the tenth-of-a-second we display before picking a branch, so e.g.
  // 59_999ms reads as "1m 0s" rather than "60.0s".
  const roundedMs = Math.round(durationMs / 100) * 100;
  if (roundedMs < 60_000) {
    const seconds = (roundedMs / 1_000).toFixed(1);
    return t`${seconds}s`;
  }
  const d = dayjs.duration(roundedMs);
  if (roundedMs < 3_600_000) {
    const minutes = d.minutes();
    const seconds = d.seconds();
    return t`${minutes}m ${seconds}s`;
  }
  // Hour-plus: use TOTAL hours (asHours can exceed 24 for very long
  // backfills) plus the leftover minutes within the hour.
  const hours = Math.floor(d.asHours());
  const minutes = d.minutes();
  return t`${hours}h ${minutes}m`;
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
    : getTimeFormatFromStyle(timeStyle, unit, timeEnabled as any);

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
    getTimeFormatFromStyle(timeStyle, unit, timeEnabled as any);

  return parsedTime.isValid() ? parsedTime.format(timeFormat) : String(time);
}
