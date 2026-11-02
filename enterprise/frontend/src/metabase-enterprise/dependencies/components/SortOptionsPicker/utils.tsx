import { t } from "ttag";

import type { DependencySortColumn } from "metabase-types/api";

import type { SortColumnItem, SortDirectionItem } from "./types";

export function getSortColumnItems(
  availableSortColumns: DependencySortColumn[],
): SortColumnItem[] {
  const allLabels: Record<DependencySortColumn, string> = {
    name: t`Name`,
    location: t`Location`,
    "view-count": t`View count`,
    "dependents-errors": t`Problems`,
    "dependents-with-errors": t`Broken dependents`,
  };

  return availableSortColumns.map((column) => ({
    value: column,
    label: allLabels[column],
  }));
}

export function getSortDirectionItems(): SortDirectionItem[] {
  return [
    {
      value: "asc",
      ariaLabel: t`Ascending`,
      icon: "arrow_up",
    },
    {
      value: "desc",
      ariaLabel: t`Descending`,
      icon: "arrow_down",
    },
  ];
}
