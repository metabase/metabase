import { msgid, ngettext } from "ttag";
import { Moment } from "moment-timezone";
import {
  format_time,
  format_time_with_unit,
} from "cljs/metabase.shared.formatting.time";
import type { DatetimeUnit } from "metabase-types/api/query";

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

export function formatTime(time: Moment) {
  return format_time(time);
}

interface TimeWithUnitType {
  local?: boolean;
  time_enabled?: "minutes" | "milliseconds" | "seconds" | boolean;
  time_style?: string;
}

export function formatTimeWithUnit(
  value: number,
  unit: DatetimeUnit,
  options: TimeWithUnitType = {},
) {
  return format_time_with_unit(value, { ...options, unit });
}
