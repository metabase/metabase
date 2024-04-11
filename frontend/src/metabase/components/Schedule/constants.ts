import { c, t } from "ttag";
import { times } from "underscore";

import type { ScheduleDayType } from "metabase-types/api";

export const minutes = times(60, n => ({
  label: n.toString(),
  value: n.toString(),
}));

export const hours = times(12, n => ({
  label: c("This is a time like 12:00pm. {0} is the hour part of the time").t`${
    n === 0 ? 12 : n
  }:00`,
  value: `${n}`,
}));

export const optionNameTranslations = {
  // The context is needed because 'hourly' can be an adjective ('hourly rate') or adverb ('update hourly'). Same with 'daily', 'weekly', and 'monthly'.
  hourly: c("adverb").t`hourly`,
  daily: c("adverb").t`daily`,
  //weekly: c("adverb").t`weekly`,
  weekly: c("adverb").t`weekly`,
  monthly: c("adverb").t`monthly`,
};

export type DayOfWeek = {
  label: string;
  value: ScheduleDayType;
};

export const daysOfTheWeek: DayOfWeek[] = [
  { label: t`Sunday`, value: "sun" },
  { label: t`Monday`, value: "mon" },
  { label: t`Tuesday`, value: "tue" },
  { label: t`Wednesday`, value: "wed" },
  { label: t`Thursday`, value: "thu" },
  { label: t`Friday`, value: "fri" },
  { label: t`Saturday`, value: "sat" },
];

export const amAndPM = [
  { label: c("As in 9:00 AM").t`AM`, value: "0" },
  { label: c("As in 9:00 PM").t`PM`, value: "1" },
];

export const frames = [
  { label: t`first`, value: "first" },
  { label: t`last`, value: "last" },
  { label: t`15th (midpoint)`, value: "mid" },
];

export const defaultDay = "mon";
