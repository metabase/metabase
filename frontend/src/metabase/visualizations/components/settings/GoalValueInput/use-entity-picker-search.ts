import { skipToken, useSearchQuery } from "metabase/api";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { SearchRequest } from "metabase-types/api";

const SEARCH_PARAMS: Partial<SearchRequest> = { limit: 5 };

const MEASURE_AND_METRIC_MODELS: MiniPickerPickableItem["model"][] = [
  "measure",
  "metric",
];

// Questions are left to "Browse all", unless there's nothing else to offer
const QUESTION_FALLBACK_MODELS: MiniPickerPickableItem["model"][] = ["card"];

export function useEntityPickerSearch(enabled: boolean) {
  const { data: measuresAndMetricsProbe } = useSearchQuery(
    enabled
      ? {
          models: ["measure", "metric"],
          limit: 0,
          context: "entity-picker",
        }
      : skipToken,
  );
  const shouldFallBackToQuestions = measuresAndMetricsProbe?.total === 0;

  return {
    models: shouldFallBackToQuestions
      ? QUESTION_FALLBACK_MODELS
      : MEASURE_AND_METRIC_MODELS,
    searchParams: SEARCH_PARAMS,
  };
}
