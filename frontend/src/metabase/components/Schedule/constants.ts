import { c, t } from "ttag";
import { times } from "underscore";

import { has24HourModeSetting } from "metabase/lib/time";
import type { ScheduleDayType } from "metabase-types/api";

export const minutes = times(60, n => ({
  label: n.toString(),
  value: n.toString(),
}));

const addZeroesToHour = (
  hour: number,
  { useZero = false }: { useZero: boolean },
) => {
  if (!useZero && hour === 0) {
    hour = 12;
  }
  return c("This is a time like 12:00pm. {0} is the hour part of the time")
    .t`${hour}:00`;
};

export const getHours = () => {
  const isClock24Hour = has24HourModeSetting();
  return times(isClock24Hour ? 24 : 12, n => ({
    label: addZeroesToHour(n, { useZero: isClock24Hour }),
    value: `${n}`,
  }));
};

export const optionNameTranslations = {
  // The context is needed because 'hourly' can be an adjective ('hourly rate') or adverb ('update hourly'). Same with 'daily', 'weekly', and 'monthly'.
  hourly: c("adverb").t`hourly`,
  daily: c("adverb").t`daily`,
  weekly: c("adverb").t`weekly`,
  monthly: c("adverb").t`monthly`,
};

export type Weekday = {
  label: string;
  value: ScheduleDayType;
};

export const weekdays: Weekday[] = [
  { label: t`Sunday`, value: "sun" },
  { label: t`Monday`, value: "mon" },
  { label: t`Tuesday`, value: "tue" },
  { label: t`Wednesday`, value: "wed" },
  { label: t`Thursday`, value: "thu" },
  { label: t`Friday`, value: "fri" },
  { label: t`Saturday`, value: "sat" },
];

export const weekdayOfMonthOptions = [
  { label: t`calendar day`, value: "calendar-day" },
  ...weekdays,
];

export const amAndPM = [
  { label: c("As in 9:00 AM").t`AM`, value: "0" },
  { label: c("As in 9:00 PM").t`PM`, value: "1" },
];

export const frames = [
  {
    label: c("Appears in contexts like 'Monthly on the first Monday'").t`first`,
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

export const defaultDay = "mon";
export const defaultHour = 8;

export enum Cron {
  AllValues = "*",
  NoSpecificValue = "?",
  NoSpecificValue_Escaped = "\\?",
}
