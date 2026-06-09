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
    return t`${Math.round(durationMs)}ms`;
  }
  // Snap to the coarsest precision we display (0.1s) before picking a tier, so a
  // value that rounds up to a boundary is promoted: 59_999ms reads as "1m 0s",
  // never an impossible "60.0s".
  const d = dayjs.duration(Math.round(durationMs / 100) * 100);
  if (d.asMinutes() < 1) {
    return t`${d.asSeconds().toFixed(1)}s`;
  }
  if (d.asHours() < 1) {
    return t`${d.minutes()}m ${d.seconds()}s`;
  }
  // asHours (vs hours()) so very long backfills don't wrap past 24h.
  return t`${Math.floor(d.asHours())}h ${d.minutes()}m`;
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
