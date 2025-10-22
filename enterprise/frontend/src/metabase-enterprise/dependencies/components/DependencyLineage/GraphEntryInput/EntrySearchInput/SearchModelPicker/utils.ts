import { t } from "ttag";

import type { SearchResponse } from "metabase-types/api";

import type { EnabledSearchModel } from "../../constants";

import type { SearchModelItem } from "./types";

export function getSearchModelItems(data: SearchResponse): SearchModelItem[] {
  const mapping: Record<EnabledSearchModel, SearchModelItem> = {
    table: {
      value: "table",
      label: t`Tables`,
    },
    card: {
      value: "card",
      label: t`Questions`,
    },
    dataset: {
      value: "dataset",
      label: t`Models`,
    },
    metric: {
      value: "metric",
      label: t`Metrics`,
    },
    transform: {
      value: "transform",
      label: t`Transforms`,
    },
  };

  const allItems = Object.values(mapping);
  const availableModels = data.available_models ?? [];
  return allItems.filter((item) => availableModels.includes(item.value));
}
