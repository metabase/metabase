import { c, t } from "ttag";
import _ from "underscore";

import { has24HourModeSetting } from "metabase/lib/time";
import type { ScheduleDayType, ScheduleFrameType } from "metabase-types/api";

export const minutes = _.times(60, n => ({
  label: n.toString(),
  value: n.toString(),
}));

export const getHours = () => {
  const localizedHours = [
    c("A time on a 24-hour clock").t`0:00`,
    c("A time").t`1:00`,
    c("A time").t`2:00`,
    c("A time").t`3:00`,
    c("A time").t`4:00`,
    c("A time").t`5:00`,
    c("A time").t`6:00`,
    c("A time").t`7:00`,
    c("A time").t`8:00`,
    c("A time").t`9:00`,
    c("A time").t`10:00`,
    c("A time").t`11:00`,
    c("A time").t`12:00`,
    c("A time on a 24-hour clock").t`13:00`,
    c("A time on a 24-hour clock").t`14:00`,
    c("A time on a 24-hour clock").t`15:00`,
    c("A time on a 24-hour clock").t`16:00`,
    c("A time on a 24-hour clock").t`17:00`,
    c("A time on a 24-hour clock").t`18:00`,
    c("A time on a 24-hour clock").t`19:00`,
    c("A time on a 24-hour clock").t`20:00`,
    c("A time on a 24-hour clock").t`21:00`,
    c("A time on a 24-hour clock").t`22:00`,
    c("A time on a 24-hour clock").t`23:00`,
  ];
  const isClock24Hour = has24HourModeSetting();
  const hourCount = isClock24Hour ? 24 : 12;
  const firstHourIndex = isClock24Hour ? 0 : 12;
  const firstHourValue = isClock24Hour ? 0 : 12;
  return _.times(hourCount, n => ({
    label: localizedHours[n === 0 ? firstHourIndex : n],
    value: `${n === 0 ? firstHourValue : n}`,
  }));
};

export type Weekday = {
  label: string;
  value: ScheduleDayType;
};

/** These strings are created in a function, rather than in module scope, so that ttag is not called until the locale is set */
export const getScheduleStrings = () => {
  const scheduleOptionNames = {
    // The context is needed because 'hourly' can be an adjective ('hourly rate') or adverb ('update hourly'). Same with 'daily', 'weekly', and 'monthly'.
    hourly: c("adverb").t`hourly`,
    daily: c("adverb").t`daily`,
    weekly: c("adverb").t`weekly`,
    monthly: c("adverb").t`monthly`,
  };

  const weekdays: Weekday[] = [
    {
      label: c(
        "Occurs in phrases like 'Send weekly on Sunday'. Only capitalize if necessary",
      ).t`Sunday`,
      value: "sun",
    },
    {
      label: c(
        "Occurs in phrases like 'Send weekly on Monday'. Only capitalize if necessary",
      ).t`Monday`,
      value: "mon",
    },
    {
      label: c(
        "Occurs in phrases like 'Send weekly on Tuesday'. Only capitalize if necessary",
      ).t`Tuesday`,
      value: "tue",
    },
    {
      label: c(
        "Occurs in phrases like 'Send weekly on Wednesday'. Only capitalize if necessary",
      ).t`Wednesday`,
      value: "wed",
    },
    {
      label: c(
        "Occurs in phrases like 'Send weekly on Thursday'. Only capitalize if necessary",
      ).t`Thursday`,
      value: "thu",
    },
    {
      label: c(
        "Occurs in phrases like 'Send weekly on Friday'. Only capitalize if necessary",
      ).t`Friday`,
      value: "fri",
    },
    {
      label: c(
        "Occurs in phrases like 'Send weekly on Saturday'. Only capitalize if necessary",
      ).t`Saturday`,
      value: "sat",
    },
  ];

  const weekdayOfMonthOptions: (
    | Weekday
    | { label: string; value: "calendar-day" }
  )[] = [{ label: t`calendar day`, value: "calendar-day" }, ...weekdays];

  const amAndPM = [
    // We use a fallback string in case the translator translated
    // 'AM' or 'PM' as an empty string, which might happen since
    // certain cultures do not use AM/PM.
    { label: c("As in 9:00 AM").t`AM`.trim() || "AM", value: "0" },
    { label: c("As in 9:00 PM").t`PM`.trim() || "PM", value: "1" },
  ];

  const frames: { label: string; value: ScheduleFrameType }[] = [
    {
      label: c("Appears in contexts like 'Monthly on the first Monday'")
        .t`first`,
      value: "first",
    },
    {
      label: c("Appears in contexts like 'Monthly on the last Monday'").t`last`,
      value: "last",
    },
    {
      label: c(
        "This is a noun meaning 'the fifteenth of the month', not an adjective. It appears in the phrase 'Monthly on the 15th'",
      ).t`15th`,
      value: "mid",
    },
  ];
  return {
    scheduleOptionNames,
    weekdays,
    weekdayOfMonthOptions,
    amAndPM,
    frames,
  };
};

export const defaultDay = "mon";
export const defaultHour = 8;

export enum Cron {
  AllValues = "*",
  NoSpecificValue = "?",
  NoSpecificValue_Escaped = "\\?",
}

export type ScheduleComponentType =
  | "frequency"
  | "frame"
  | "weekdayOfMonth"
  | "weekday"
  | "time"
  | "amPm"
  | "minute";

export const getScheduleComponentLabel = (
  componentType: ScheduleComponentType,
) => {
  const map: Record<ScheduleComponentType, string> = {
    frequency: t`Frequency`,
    frame: t`First, 15th, or last of the month`,
    weekdayOfMonth: t`Day of the month`,
    weekday: t`Day of the week`,
    time: t`Time`,
    amPm: t`AM/PM`,
    minute: t`Minute`,
  };
  return map[componentType];
};
