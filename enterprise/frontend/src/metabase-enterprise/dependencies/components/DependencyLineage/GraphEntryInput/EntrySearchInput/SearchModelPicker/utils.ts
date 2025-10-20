import { t } from "ttag";

import type { SearchResponse } from "metabase-types/api";

import type { SearchModelItem } from "./types";

export function getSearchModelItems(data: SearchResponse): SearchModelItem[] {
  const allItems: SearchModelItem[] = [
    { value: "table", label: t`Tables` },
    { value: "card", label: t`Questions` },
    { value: "dataset", label: t`Models` },
    { value: "metric", label: t`Metrics` },
    { value: "transform", label: t`Transforms` },
  ];
  const availableModels = data.available_models ?? [];
  return allItems.filter((item) => availableModels.includes(item.value));
}
