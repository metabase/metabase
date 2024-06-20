import { t } from "ttag";
import _ from "underscore";

import type { CollectionItem } from "metabase-types/api";

export const itemKeyFn = (item: CollectionItem) => `${item.id}:${item.model}`;

export const dateFilterOptions = [
  {
    optionLabel: t`1 month`,
    label: t`Not viewed in over 1 month`,
    value: "one-month",
  },
  {
    optionLabel: t`2 months`,
    label: t`Not viewed in over 2 months`,
    value: "two-months",
  },
  {
    optionLabel: t`3 months`,
    label: t`Not viewed in over 3 months`,
    value: "three-months",
  },
  {
    optionLabel: t`6 months`,
    label: t`Not viewed in over 6 months`,
    value: "six-months",
  },
  {
    optionLabel: t`9 months`,
    label: t`Not viewed in over 9 months`,
    value: "nine-months",
  },
  {
    optionLabel: t`1 year`,
    label: t`Not viewed in over 1 year`,
    value: "twelve-months",
  },
  {
    optionLabel: t`1.5 years`,
    label: t`Not viewed in over 1.5 years`,
    value: "eighteen-months",
  },
  {
    optionLabel: t`2 years`,
    label: t`Not viewed in over 2 years`,
    value: "twenty-four-months",
  },
] as const;

export type DateFilter = typeof dateFilterOptions[number]["value"];

const dateFilters = new Set(dateFilterOptions.map(option => option.value));

export const isDateFilter = (value: string): value is DateFilter => {
  return (dateFilters as Set<string>).has(value);
};

export const getDateFilterOptionLabel = (dateFilter: DateFilter) => {
  const option = dateFilterOptions.find(option => option.value === dateFilter);
  const optionLabel = option?.optionLabel;

  if (!optionLabel) {
    throw new Error(`Invalid date filter: ${dateFilter}`);
  }

  return optionLabel;
};
