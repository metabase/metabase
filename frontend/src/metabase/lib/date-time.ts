import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";
import _ from "underscore";

import type { DayOfWeekId } from "metabase-types/api";

// returns 0-6 where Sunday as 0 and Saturday as 6
// Note: Keep in mind that this relays on moment internal state, which is not ideal.
export const getFirstDayOfWeekIndex = (): number => {
  return moment().startOf("week").isoWeekday();
};

type DayOfWeekOption = {
  name: string;
  shortName: string;
  value: string;
  id: DayOfWeekId;
};

export const DAY_OF_WEEK_OPTIONS: DayOfWeekOption[] = [
  { name: t`Sunday`, shortName: t`Su`, value: "sun", id: "sunday" },
  { name: t`Monday`, shortName: t`Mo`, value: "mon", id: "monday" },
  { name: t`Tuesday`, shortName: t`Tu`, value: "tue", id: "tuesday" },
  { name: t`Wednesday`, shortName: t`We`, value: "wed", id: "wednesday" },
  { name: t`Thursday`, shortName: t`Th`, value: "thu", id: "thursday" },
  { name: t`Friday`, shortName: t`Fr`, value: "fri", id: "friday" },
  { name: t`Saturday`, shortName: t`Sa`, value: "sat", id: "saturday" },
];

export const getDayOfWeekOptions = (): DayOfWeekOption[] => {
  const firstDayOfWeek = getFirstDayOfWeekIndex();

  if (firstDayOfWeek === 0) {
    return DAY_OF_WEEK_OPTIONS;
  }

  return [
    ...DAY_OF_WEEK_OPTIONS.slice(firstDayOfWeek),
    ...DAY_OF_WEEK_OPTIONS.slice(0, firstDayOfWeek),
  ];
};

export const HOUR_OPTIONS = _.times(12, n => ({
  name: (n === 0 ? 12 : n) + ":00",
  value: n,
}));

export const MINUTE_OPTIONS = _.times(60, n => ({
  name: n.toString(),
  value: n,
}));

export const AM_PM_OPTIONS = [
  { name: "AM", value: 0 },
  { name: "PM", value: 1 },
];

export const MONTH_DAY_OPTIONS = [
  { name: t`First`, value: "first" },
  { name: t`Last`, value: "last" },
  { name: t`15th (Midpoint)`, value: "mid" },
];
