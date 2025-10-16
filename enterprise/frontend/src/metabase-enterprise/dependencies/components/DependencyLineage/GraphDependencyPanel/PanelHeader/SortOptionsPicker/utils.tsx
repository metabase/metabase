import { t } from "ttag";

import { FixedSizeIcon } from "metabase/ui";

import type { SortColumnItem, SortDirectionItem } from "./types";

export function getSortColumnItems(): SortColumnItem[] {
  return [
    {
      value: "view-count",
      label: t`View count`,
    },
    {
      value: "name",
      label: t`Name`,
    },
    {
      value: "location",
      label: t`Location`,
    },
  ];
}

export function getSortDirectionItems(): SortDirectionItem[] {
  return [
    {
      value: "asc",
      label: <FixedSizeIcon name="arrow_up" />,
    },
    {
      value: "desc",
      label: <FixedSizeIcon name="arrow_down" />,
    },
  ];
}
