import { t } from "ttag";

import Filter from "metabase-lib/lib/queries/structured/Filter";

export type OnFilterChange = (
  filter: Filter,
  commitImmediately: boolean,
) => void;

export enum PredefinedFilter {
  TODAY = "today",
  YESTERDAY = "yesterday",
  LAST_WEEK = "last-week",
  LAST_7_DAYS = "last-7-days",
  LAST_30_DAYS = "last-30-days",
  LAST_MONTH = "last-month",
  LAST_3_MONTHS = "last-3-months",
  LAST_12_MONTHS = "last-12-months",
}

type PredefinedFilterOption = { id: PredefinedFilter; name: string };

export const PREDEFINED_RELATIVE_DAY_FILTER_OPTIONS: PredefinedFilterOption[] = [
  {
    id: PredefinedFilter.TODAY,
    name: t`Today`,
  },
  {
    id: PredefinedFilter.YESTERDAY,
    name: t`Yesterday`,
  },
  {
    id: PredefinedFilter.LAST_WEEK,
    name: t`Last week`,
  },
  {
    id: PredefinedFilter.LAST_7_DAYS,
    name: t`Last 7 days`,
  },
  {
    id: PredefinedFilter.LAST_30_DAYS,
    name: t`Last 30 days`,
  },
];

export const PREDEFINED_RELATIVE_MONTH_FILTER_OPTIONS: PredefinedFilterOption[] = [
  {
    id: PredefinedFilter.LAST_MONTH,
    name: t`Last month`,
  },
  {
    id: PredefinedFilter.LAST_3_MONTHS,
    name: t`Last 3 months`,
  },
  {
    id: PredefinedFilter.LAST_12_MONTHS,
    name: t`Last 12 months`,
  },
];

export const CUSTOM_FILTER_OPTIONS = [
  {
    id: "specific",
    name: t`Specific dates…`,
  },
  {
    id: "relative-past",
    name: t`Relative dates…`,
  },
  {
    id: "exclude",
    name: t`Exclude…`,
  },
] as const;
