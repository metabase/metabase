import { t } from "ttag";

import type { SearchResponse } from "metabase-types/api";

import {
  ENABLED_SEARCH_MODELS,
  type EnabledSearchModel,
} from "../../constants";

import type { SearchModelItem } from "./types";

export function getSearchModelItems(data: SearchResponse): SearchModelItem[] {
  const allLabels: Record<EnabledSearchModel, string> = {
    table: t`Tables`,
    transform: t`Transforms`,
    card: t`Questions`,
    dataset: t`Models`,
    metric: t`Metrics`,
    dashboard: t`Dashboards`,
    document: t`Documents`,
    segment: t`Segments`,
  };

  const allItems = ENABLED_SEARCH_MODELS.map((model) => ({
    value: model,
    label: allLabels[model],
  }));

  const availableModels = data.available_models ?? [];
  return allItems.filter((item) => availableModels.includes(item.value));
}
