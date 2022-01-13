import { t } from "ttag";

import Filter from "metabase-lib/lib/queries/structured/Filter";

export type OnFilterChange = (
  filter: Filter,
  commitImmediately: boolean,
) => void;

export type PredefinedFilterId =
  | "today"
  | "yesterday"
  | "last-week"
  | "last-7-days"
  | "last-30-days"
  | "last-month"
  | "last-3-months"
  | "last-12-months";

type PredefinedFilterOption = { id: PredefinedFilterId; name: string };

export const PREDEFINED_RELATIVE_DAY_FILTER_OPTIONS: PredefinedFilterOption[] = [
  {
    id: "today",
    name: t`Today`,
  },
  {
    id: "yesterday",
    name: t`Yesterday`,
  },
  {
    id: "last-week",
    name: t`Last week`,
  },
  {
    id: "last-7-days",
    name: t`Last 7 days`,
  },
  {
    id: "last-30-days",
    name: t`Last 30 days`,
  },
];

export const PREDEFINED_RELATIVE_MONTH_FILTER_OPTIONS: PredefinedFilterOption[] = [
  {
    id: "last-month",
    name: t`Last month`,
  },
  {
    id: "last-3-months",
    name: t`Last 3 months`,
  },
  {
    id: "last-12-months",
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
