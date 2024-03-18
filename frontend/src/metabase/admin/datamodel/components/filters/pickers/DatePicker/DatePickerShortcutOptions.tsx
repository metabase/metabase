import { t } from "ttag";

import type Filter from "metabase-lib/v1/queries/structured/Filter";
import {
  getInitialExcludeShortcut,
  getInitialSpecificDatesShortcut,
  getInitialRelativeDatesShortcut,
  getLast12MonthsDateFilter,
  getLast30DaysDateFilter,
  getLast3MonthsDateFilter,
  getLast7DaysDateFilter,
  getLastMonthDateFilter,
  getTodayDateFilter,
  getYesterdayDateFilter,
  getLastWeekDateFilter,
} from "metabase-lib/v1/queries/utils/date-filters";

type Option = {
  displayName: string;
  init: (filter: Filter) => any;
};

const DAY_OPTIONS: Option[] = [
  {
    displayName: t`Today`,
    init: filter => getTodayDateFilter(filter),
  },
  {
    displayName: t`Yesterday`,
    init: filter => getYesterdayDateFilter(filter),
  },
  {
    displayName: t`Last Week`,
    init: filter => getLastWeekDateFilter(filter),
  },
  {
    displayName: t`Last 7 Days`,
    init: filter => getLast7DaysDateFilter(filter),
  },
  {
    displayName: t`Last 30 Days`,
    init: filter => getLast30DaysDateFilter(filter),
  },
];

const MONTH_OPTIONS: Option[] = [
  {
    displayName: t`Last Month`,
    init: filter => getLastMonthDateFilter(filter),
  },
  {
    displayName: t`Last 3 Months`,
    init: filter => getLast3MonthsDateFilter(filter),
  },
  {
    displayName: t`Last 12 Months`,
    init: filter => getLast12MonthsDateFilter(filter),
  },
];

const MISC_OPTIONS: Option[] = [
  {
    displayName: t`Specific dates...`,
    init: filter => getInitialSpecificDatesShortcut(filter),
  },
  {
    displayName: t`Relative dates...`,
    init: filter => getInitialRelativeDatesShortcut(filter),
  },
  {
    displayName: t`Exclude...`,
    init: filter => getInitialExcludeShortcut(filter),
  },
];

export interface DateShortcutOptions {
  DAY_OPTIONS: Option[];
  MONTH_OPTIONS: Option[];
  MISC_OPTIONS: Option[];
}

export const DATE_SHORTCUT_OPTIONS: DateShortcutOptions = {
  DAY_OPTIONS,
  MONTH_OPTIONS,
  MISC_OPTIONS,
};
