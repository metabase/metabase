import { t } from "ttag";

import type { FilterItem } from "./types";

export function getFilterItems(): FilterItem[] {
  return [
    {
      value: "verified",
      label: t`Verified`,
    },
    {
      value: "in-dashboard",
      label: t`In a dashboard`,
    },
    {
      value: "in-official-collection",
      label: t`In an official collection`,
    },
    {
      value: "not-in-personal-collection",
      label: t`Not in personal collection`,
    },
  ];
}
