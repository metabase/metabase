import { t } from "ttag";

import { FixedSizeIcon } from "metabase/ui";

import { SORT_COLUMNS } from "../../constants";
import type { SortColumn } from "../../types";

import type { SortColumnItem, SortDirectionItem } from "./types";

export function getSortColumnItems(): SortColumnItem[] {
  const allLabels: Record<SortColumn, string> = {
    name: t`Name`,
    location: t`Location`,
    "view-count": t`View count`,
  };

  return SORT_COLUMNS.map((column) => ({
    value: column,
    label: allLabels[column],
  }));
}

export function getSortDirectionItems(): SortDirectionItem[] {
  return [
    {
      value: "asc",
      label: <FixedSizeIcon name="arrow_up" aria-label={t`Ascending`} />,
    },
    {
      value: "desc",
      label: <FixedSizeIcon name="arrow_down" aria-label={t`Descending`} />,
    },
  ];
}
