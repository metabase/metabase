import dayjs from "dayjs";
import { c } from "ttag";

import type { CollectionItem } from "metabase-types/api";

export const itemKeyFn = (item: CollectionItem) => `${item.id}:${item.model}`;

const labelContext = `Time span the item has not been viewed in, reads as "Not viewed in over <time span>"`;

export const dateFilterOptions = [
  {
    label: c(labelContext).t`1 month`,
    value: "one-month",
    duration: [[1, "month"]],
  },
  {
    label: c(labelContext).t`2 months`,
    value: "two-months",
    duration: [[2, "month"]],
  },
  {
    label: c(labelContext).t`3 months`,
    value: "three-months",
    duration: [[3, "month"]],
  },
  {
    label: c(labelContext).t`6 months`,
    value: "six-months",
    duration: [[6, "month"]],
  },
  {
    label: c(labelContext).t`9 months`,
    value: "nine-months",
    duration: [[9, "month"]],
  },
  {
    label: c(labelContext).t`1 year`,
    value: "one-year",
    duration: [[1, "year"]],
  },
  {
    label: c(labelContext).t`1.5 years`,
    value: "one-and-a-half-years",
    duration: [
      [1, "year"],
      [6, "month"],
    ],
  },
  {
    label: c(labelContext).t`2 years`,
    value: "two-years",
    duration: [[2, "year"]],
  },
] as const;

export type DateFilter = typeof dateFilterOptions[number]["value"];
export type DateFilterOption = {
  label: string;
  value: DateFilter;
  duration: Array<[number, string]>;
};
export type DateFilterOptions = DateFilterOption[];

const dateFiltersMap = Object.fromEntries(
  dateFilterOptions.map(option => [option.value, option]),
) as unknown as Record<DateFilter, DateFilterOption>;

export const isDateFilter = (value: string): value is DateFilter => {
  return value in dateFiltersMap;
};

export const getDateFilterValue = (dateFilter: DateFilter) => {
  const today = dayjs().startOf("day");

  const dateFilterOption = dateFiltersMap[dateFilter];
  const filterOffsetDurations = dateFilterOption.duration;
  const date = filterOffsetDurations.reduce((date, [amount, unit]) => {
    return date.subtract(amount, unit);
  }, today);

  return date.format("YYYY-MM-DD");
};

export const getDateFilterLabel = (dateFilter: DateFilter) => {
  const option = dateFilterOptions.find(option => option.value === dateFilter);
  const label = option?.label;

  if (!label) {
    throw new Error(`Invalid date filter: ${dateFilter}`);
  }

  return label;
};
