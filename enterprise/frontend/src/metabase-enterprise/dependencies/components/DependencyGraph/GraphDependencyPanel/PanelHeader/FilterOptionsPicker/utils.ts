import { t } from "ttag";

import { FILTER_OPTIONS } from "../../constants";
import type { FilterOption } from "../../types";

import type { FilterItem } from "./types";

export function getFilterItems(): FilterItem[] {
  const allLabels: Record<FilterOption, string> = {
    verified: t`Verified`,
    "in-dashboard": t`In a dashboard`,
    "in-official-collection": t`In an official collection`,
    "not-in-personal-collection": t`Not in personal collection`,
  };

  return FILTER_OPTIONS.map((option) => ({
    value: option,
    label: allLabels[option],
  }));
}
