import dayjs from "dayjs";
import { t } from "ttag";
import _ from "underscore";

import type { DayOfWeekId } from "metabase-types/api";

// returns 0-6 where Sunday as 0 and Saturday as 6
const getFirstDayOfWeekIndex = (): number => {
  return dayjs().startOf("week").isoWeekday();
};

type DayOfWeekOption = {
  name: string;
  shortName: string;
  value: string;
  id: DayOfWeekId;
};

export const DAY_OF_WEEK_OPTIONS: DayOfWeekOption[] = [
  {
    get name() {
      return t`Sunday`;
    },
    get shortName() {
      return t`Su`;
    },
    value: "sun",
    id: "sunday",
  },
  {
    get name() {
      return t`Monday`;
    },
    get shortName() {
      return t`Mo`;
    },
    value: "mon",
    id: "monday",
  },
  {
    get name() {
      return t`Tuesday`;
    },
    get shortName() {
      return t`Tu`;
    },
    value: "tue",
    id: "tuesday",
  },
  {
    get name() {
      return t`Wednesday`;
    },
    get shortName() {
      return t`We`;
    },
    value: "wed",
    id: "wednesday",
  },
  {
    get name() {
      return t`Thursday`;
    },
    get shortName() {
      return t`Th`;
    },
    value: "thu",
    id: "thursday",
  },
  {
    get name() {
      return t`Friday`;
    },
    get shortName() {
      return t`Fr`;
    },
    value: "fri",
    id: "friday",
  },
  {
    get name() {
      return t`Saturday`;
    },
    get shortName() {
      return t`Sa`;
    },
    value: "sat",
    id: "saturday",
  },
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

export const HOUR_OPTIONS = _.times(12, (n) => ({
  name: (n === 0 ? 12 : n) + ":00",
  value: n,
}));

export const MINUTE_OPTIONS = _.times(60, (n) => ({
  name: n.toString(),
  value: n,
}));

export const AM_PM_OPTIONS = [
  { name: "AM", value: 0 },
  { name: "PM", value: 1 },
];

export const MONTH_DAY_OPTIONS = [
  {
    get name() {
      return t`First`;
    },
    value: "first",
  },
  {
    get name() {
      return t`Last`;
    },
    value: "last",
  },
  {
    get name() {
      return t`15th (Midpoint)`;
    },
    value: "mid",
  },
];
