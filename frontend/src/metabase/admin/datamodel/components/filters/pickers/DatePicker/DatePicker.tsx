import { t } from "ttag";

import type { FilterMBQL } from "metabase-lib/v1/queries/structured/Filter";
import {
  getAfterDateFilter,
  getBeforeDateFilter,
  getBetweenDateFilter,
  getCurrentDateFilter,
  getExcludeDateFilter,
  getNextDateFilter,
  getOnDateFilter,
  getPreviousDateFilter,
  isAfterDateFilter,
  isBeforeDateFilter,
  isBetweenFilter,
  isCurrentDateFilter,
  isExcludeDateFilter,
  isNextDateFilter,
  isOnDateFilter,
  isPreviousDateFilter,
} from "metabase-lib/v1/queries/utils/date-filters";

export type DatePickerGroup = "relative" | "specific";

export type DateOperator = {
  name: string;
  displayName: string;
  displayPrefix?: string;
  init: (filter: FilterMBQL) => any[];
  test: (filter: FilterMBQL) => boolean;
  group?: DatePickerGroup;
  options?: any;
};

export const DATE_OPERATORS: DateOperator[] = [
  {
    name: "previous",
    displayName: t`Previous`,
    init: filter => getPreviousDateFilter(filter),
    test: filter => isPreviousDateFilter(filter),
    group: "relative",
    options: { "include-current": true },
  },
  {
    name: "current",
    displayName: t`Current`,
    init: filter => getCurrentDateFilter(filter),
    test: filter => isCurrentDateFilter(filter),
    group: "relative",
  },
  {
    name: "next",
    displayName: t`Next`,
    init: filter => getNextDateFilter(filter),
    test: filter => isNextDateFilter(filter),
    group: "relative",
    options: { "include-current": true },
  },
  {
    name: "between",
    displayName: t`Between`,
    init: filter => getBetweenDateFilter(filter),
    test: filter => isBetweenFilter(filter),
    group: "specific",
  },
  {
    name: "before",
    displayName: t`Before`,
    init: filter => getBeforeDateFilter(filter),
    test: filter => isBeforeDateFilter(filter),
    group: "specific",
  },
  {
    name: "on",
    displayName: t`On`,
    init: filter => getOnDateFilter(filter),
    test: filter => isOnDateFilter(filter),
    group: "specific",
  },
  {
    name: "after",
    displayName: t`After`,
    init: filter => getAfterDateFilter(filter),
    test: filter => isAfterDateFilter(filter),
    group: "specific",
  },
  {
    name: "exclude",
    displayName: t`Exclude...`,
    displayPrefix: t`Exclude`,
    init: filter => getExcludeDateFilter(filter),
    test: filter => isExcludeDateFilter(filter),
  },
];
