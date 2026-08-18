import { useCallback, useMemo } from "react";

import { skipToken, useListRecentsQuery, useSearchQuery } from "metabase/api";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { SearchRequest } from "metabase-types/api";

const SEARCH_RESULTS_LIMIT = 5;

const MEASURE_MODELS: MiniPickerPickableItem["model"][] = ["measure"];

const QUESTION_FALLBACK_MODELS: MiniPickerPickableItem["model"][] = [
  "card",
  "dataset",
  "metric",
];

/**
 * Searches measures. When the instance has no measures at all, falls back to
 * questions/models/metrics, with the most recent ones shown for the empty query.
 */
export function useEntityPickerSearch(enabled: boolean) {
  const { data: probe } = useSearchQuery(
    enabled
      ? { models: ["measure"], limit: 0, context: "entity-picker" }
      : skipToken,
  );
  const shouldFallBackToQuestions = probe?.total === 0;

  const { data: recentItems } = useListRecentsQuery(
    { context: ["selections", "views"] },
    { skip: !shouldFallBackToQuestions },
  );

  const recentQuestionIds = useMemo(
    () =>
      (recentItems ?? [])
        .filter((item) => QUESTION_FALLBACK_MODELS.includes(item.model))
        .slice(0, SEARCH_RESULTS_LIMIT)
        .map((item) => item.id),
    [recentItems],
  );

  const getSearchParams = useCallback(
    (params: SearchRequest): Partial<SearchRequest> => {
      const showRecents =
        shouldFallBackToQuestions && !params.q && recentQuestionIds.length > 0;

      return {
        limit: SEARCH_RESULTS_LIMIT,
        ...(showRecents ? { ids: recentQuestionIds } : {}),
      };
    },
    [shouldFallBackToQuestions, recentQuestionIds],
  );

  return {
    models: shouldFallBackToQuestions
      ? QUESTION_FALLBACK_MODELS
      : MEASURE_MODELS,
    getSearchParams,
  };
}
