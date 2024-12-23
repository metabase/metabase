import { t } from "ttag";

import type { FilterMBQL } from "metabase-lib/v1/queries/structured/Filter";
import {
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
  test: (filter: FilterMBQL) => boolean;
  group?: DatePickerGroup;
  options?: any;
};

export const DATE_OPERATORS: DateOperator[] = [
  {
    name: "previous",
    displayName: t`Previous`,
    test: filter => isPreviousDateFilter(filter),
    group: "relative",
    options: { "include-current": true },
  },
  {
    name: "current",
    displayName: t`Current`,
    test: filter => isCurrentDateFilter(filter),
    group: "relative",
  },
  {
    name: "next",
    displayName: t`Next`,
    test: filter => isNextDateFilter(filter),
    group: "relative",
    options: { "include-current": true },
  },
  {
    name: "between",
    displayName: t`Between`,
    test: filter => isBetweenFilter(filter),
    group: "specific",
  },
  {
    name: "before",
    displayName: t`Before`,
    test: filter => isBeforeDateFilter(filter),
    group: "specific",
  },
  {
    name: "on",
    displayName: t`On`,
    test: filter => isOnDateFilter(filter),
    group: "specific",
  },
  {
    name: "after",
    displayName: t`After`,
    test: filter => isAfterDateFilter(filter),
    group: "specific",
  },
  {
    name: "exclude",
    displayName: t`Exclude...`,
    displayPrefix: t`Exclude`,
    test: filter => isExcludeDateFilter(filter),
  },
];
