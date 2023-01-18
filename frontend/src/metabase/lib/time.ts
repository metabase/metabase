import { t } from "ttag";
import moment, { DurationInputArg2, MomentInput } from "moment-timezone";

import MetabaseSettings from "metabase/lib/settings";

import type { DatetimeUnit } from "metabase-types/api/query";

import {
  coerce_to_time,
  coerce_to_timestamp,
} from "cljs/metabase.shared.util.time";

addAbbreviatedLocale();

const TIME_FORMAT_24_HOUR = "HH:mm";

// when you define a custom locale, moment automatically makes it the active global locale,
// so we need to return to the user's initial locale.
// also, you can't define a custom locale on a local instance
function addAbbreviatedLocale() {
  const initialLocale = moment.locale();

  moment.locale("en-abbreviated", {
    relativeTime: {
      future: "in %s",
      past: "%s",
      s: t`just now`,
      ss: t`just now`,
      m: "%d m",
      mm: "%d m",
      h: "%d h",
      hh: "%d h",
      d: "%d d",
      dd: "%d d",
      w: "%d wk",
      ww: "%d wks",
      M: "a mth",
      MM: "%d mths",
      y: "%d y",
      yy: "%d y",
    },
  });

  moment.locale(initialLocale);
}

export function isValidTimeInterval(interval: number, unit: DurationInputArg2) {
  if (!interval) {
    return false;
  }

  const now = moment();
  const newTime = moment().add(interval, unit);
  const diff = now.diff(newTime, "years");

  return !Number.isNaN(diff);
}

export function formatFrame(frame: "first" | "last" | "mid") {
  switch (frame) {
    case "first":
      return t`first`;
    case "last":
      return t`last`;
    case "mid":
      return t`15th (Midpoint)`;
    default:
      return frame;
  }
}

export function getDateStyleFromSettings() {
  const customFormattingSettings = MetabaseSettings.get("custom-formatting");
  return customFormattingSettings?.["type/Temporal"]?.date_style;
}

export function getDefaultTimezone() {
  return moment.tz.guess();
}

export function getNumericDateStyleFromSettings() {
  const dateStyle = getDateStyleFromSettings();
  return dateStyle && /\//.test(dateStyle) ? dateStyle : "M/D/YYYY";
}

export function getRelativeTime(timestamp: string) {
  return moment(timestamp).fromNow();
}

export function getRelativeTimeAbbreviated(timestamp: string) {
  const locale = moment().locale();

  if (locale === "en") {
    const ts = moment(timestamp);
    ts.locale("en-abbreviated");
    return ts.fromNow();
  }

  return getRelativeTime(timestamp);
}

export function getTimeStyleFromSettings() {
  const customFormattingSettings = MetabaseSettings.get("custom-formatting");
  return customFormattingSettings?.["type/Temporal"]?.time_style;
}

export function has24HourModeSetting() {
  const timeStyle = getTimeStyleFromSettings();
  return timeStyle === TIME_FORMAT_24_HOUR;
}

export function hasTimePart(date: moment.Moment | null) {
  return date != null && (date.hours() !== 0 || date.minutes() !== 0);
}

export function hoursToSeconds(hours: number) {
  return hours * 60 * 60;
}

export function msToHours(ms: number) {
  const hours = msToMinutes(ms) / 60;
  return hours;
}

export function msToMinutes(ms: number) {
  return msToSeconds(ms) / 60;
}

export function msToSeconds(ms: number) {
  return ms / 1000;
}

export function parseTime(value: moment.Moment | string): moment.Moment {
  return coerce_to_time(value);
}

export function parseTimestamp(
  value: MomentInput,
  unit: DatetimeUnit | null = null,
  local: unknown = false,
): moment.Moment {
  return coerce_to_timestamp(value, { unit, local });
}
