import { skipToken, useSearchQuery } from "metabase/api";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { SearchRequest } from "metabase-types/api";

const SEARCH_PARAMS: Partial<SearchRequest> = { limit: 5 };

const MEASURE_MODELS: MiniPickerPickableItem["model"][] = ["measure"];

const QUESTION_FALLBACK_MODELS: MiniPickerPickableItem["model"][] = [
  "card",
  "metric",
];

export function useEntityPickerSearch(enabled: boolean) {
  const { data: measuresProbe } = useSearchQuery(
    enabled
      ? { models: ["measure"], limit: 0, context: "entity-picker" }
      : skipToken,
  );
  const shouldFallBackToQuestions = measuresProbe?.total === 0;

  return {
    models: shouldFallBackToQuestions
      ? QUESTION_FALLBACK_MODELS
      : MEASURE_MODELS,
    searchParams: SEARCH_PARAMS,
  };
}
