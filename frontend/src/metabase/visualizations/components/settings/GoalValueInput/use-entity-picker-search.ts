import { skipToken, useSearchQuery } from "metabase/api";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { SearchModel, SearchRequest } from "metabase-types/api";

const SEARCH_PARAMS: Partial<SearchRequest> = { limit: 5 };

const PICKABLE_MODELS: MiniPickerPickableItem["model"][] = [
  "measure",
  "metric",
  "card",
];

const MEASURE_AND_METRIC_MODELS: SearchModel[] = ["measure", "metric"];

/**
 * Without a search query, the picker lists only measures and metrics, unless
 * the instance has none. A search query also finds questions.
 */
export function useEntityPickerSearch(enabled: boolean) {
  const { data: measuresAndMetricsProbe } = useSearchQuery(
    enabled
      ? {
          models: MEASURE_AND_METRIC_MODELS,
          limit: 0,
          context: "entity-picker",
        }
      : skipToken,
  );
  const hasNoMeasuresAndMetrics = measuresAndMetricsProbe?.total === 0;

  return {
    models: PICKABLE_MODELS,
    searchParams: hasNoMeasuresAndMetrics
      ? SEARCH_PARAMS
      : getMeasuresAndMetricsFirstSearchParams,
  };
}

function getMeasuresAndMetricsFirstSearchParams({
  q,
}: SearchRequest): Partial<SearchRequest> {
  const hasSearchQuery = Boolean(q?.trim());

  return hasSearchQuery
    ? SEARCH_PARAMS
    : { ...SEARCH_PARAMS, models: MEASURE_AND_METRIC_MODELS };
}
