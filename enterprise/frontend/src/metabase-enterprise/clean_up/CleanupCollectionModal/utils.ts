import dayjs from "dayjs";
import { c, t } from "ttag";
import _ from "underscore";

import type { StaleCollectionItem } from "../types";

// constant portion of this string is how mantine calculates the height of the modal
export const getModalHeightCalc = (additionalOffset?: string) => {
  const offsetStr = additionalOffset ? ` - ${additionalOffset}` : "";
  return `calc(100dvh - (5dvh * 2)${offsetStr})`;
};

export const itemKeyFn = (item: StaleCollectionItem) =>
  `${item.id}:${item.model}`;

export const dateFilterOptions = [
  {
    label: c(`Occurs in the phrase 'Not used in over 1 month'`).t`1 month`,
    value: "one-month",
    duration: [[1, "month"]],
  },
  {
    label: c(`Occurs in the phrase 'Not used in over 2 months'`).t`2 months`,
    value: "two-months",
    duration: [[2, "month"]],
  },
  {
    label: c(`Occurs in the phrase 'Not used in over 3 months'`).t`3 months`,
    value: "three-months",
    duration: [[3, "month"]],
  },
  {
    label: c(`Occurs in the phrase 'Not used in over 6 months'`).t`6 months`,
    value: "six-months",
    duration: [[6, "month"]],
  },
  {
    label: c(`Occurs in the phrase 'Not used in over 9 months'`).t`9 months`,
    value: "nine-months",
    duration: [[9, "month"]],
  },
  {
    label: c(`Occurs in the phrase 'Not used in over 1 year'`).t`1 year`,
    value: "one-year",
    duration: [[1, "year"]],
  },
  {
    label: c(`Occurs in the phrase 'Not used in over 1.5 years'`).t`1.5 years`,
    value: "one-and-a-half-years",
    duration: [
      [1, "year"],
      [6, "month"],
    ],
  },
  {
    label: c(`Occurs in the phrase 'Not used in over 2 years'`).t`2 years`,
    value: "two-years",
    duration: [[2, "year"]],
  },
] as const;

export type DateFilter = typeof dateFilterOptions[number]["value"];
export type DateDurations = typeof dateFilterOptions[number]["duration"];
export type DateFilterOption = {
  label: string;
  value: DateFilter;
  duration: DateDurations;
};
export type DateFilterOptions = DateFilterOption[];

const dateFiltersMap = _.object(
  dateFilterOptions.map<[DateFilter, DateFilterOption]>(option => [
    option.value,
    option,
  ]),
);

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
    throw new Error(t`Invalid date filter: ${dateFilter}`);
  }

  return label;
};
