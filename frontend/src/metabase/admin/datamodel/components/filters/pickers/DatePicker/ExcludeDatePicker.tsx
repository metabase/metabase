import { t } from "ttag";

import type { FilterMBQL } from "metabase-lib/v1/queries/structured/Filter";
import {
  getInitialDayOfWeekFilter,
  getInitialHourOfDayFilter,
  getInitialMonthOfYearFilter,
  getInitialQuarterOfYearFilter,
  isDayOfWeekDateFilter,
  isHourOfDayDateFilter,
  isMonthOfYearDateFilter,
  isQuarterofYearDateFilter,
} from "metabase-lib/v1/queries/utils/date-filters";
import { EXCLUDE_OPTIONS } from "metabase-lib/v1/queries/utils/query-time";

type Option = {
  displayName: string;
  value: string;
  serialized: string;
  test: (value: string) => boolean;
};

type Group = {
  name: string;
  displayName: string;
  init: (filter: FilterMBQL) => any[];
  test: (filter: FilterMBQL) => boolean;
  getOptionGroups: () => Option[][];
};

export const EXCLUDE_OPERATORS: Group[] = [
  {
    name: "days",
    displayName: t`Days of the week...`,
    test: filter => isDayOfWeekDateFilter(filter),
    init: filter => getInitialDayOfWeekFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["day-of-week"],
  },
  {
    name: "months",
    displayName: t`Months of the year...`,
    test: filter => isMonthOfYearDateFilter(filter),
    init: filter => getInitialMonthOfYearFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["month-of-year"],
  },
  {
    name: "quarters",
    displayName: t`Quarters of the year...`,
    test: filter => isQuarterofYearDateFilter(filter),
    init: filter => getInitialQuarterOfYearFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["quarter-of-year"],
  },
  {
    name: "hours",
    displayName: t`Hours of the day...`,
    test: filter => isHourOfDayDateFilter(filter),
    init: filter => getInitialHourOfDayFilter(filter),
    getOptionGroups: EXCLUDE_OPTIONS["hour-of-day"],
  },
];
