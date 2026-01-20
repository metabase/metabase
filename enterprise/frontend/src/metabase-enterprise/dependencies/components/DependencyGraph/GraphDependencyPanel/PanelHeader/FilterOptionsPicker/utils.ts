import { t } from "ttag";

import { FILTER_OPTIONS } from "../../constants";
import type { FilterOption } from "../../types";

import type { FilterItem } from "./types";

export function getFilterItems(): FilterItem[] {
  const allLabels: Record<FilterOption, string> = {
    "include-in-personal-collections": t`Include items in personal collections`,
  };

  return FILTER_OPTIONS.map((option) => ({
    value: option,
    label: allLabels[option],
  }));
}
