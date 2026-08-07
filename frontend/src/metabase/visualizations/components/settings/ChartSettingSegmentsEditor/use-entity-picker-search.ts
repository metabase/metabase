import { useCallback, useMemo } from "react";

import { skipToken, useListRecentsQuery, useSearchQuery } from "metabase/api";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { SearchRequest } from "metabase-types/api";

const SEARCH_RESULTS_LIMIT = 5;

// Model lists are module constants because MiniPicker re-runs its search
// whenever the `models` array changes identity.
// Metrics and saved questions are reachable through Browse all only.
const MEASURE_MODELS: MiniPickerPickableItem["model"][] = ["measure"];
// shown instead when the instance has no measures at all
const QUESTION_FALLBACK_MODELS: MiniPickerPickableItem["model"][] = [
  "card",
  "dataset",
];

/**
 * Searches measures. When the instance has no measures at all, falls back to
 * questions, with the most recent ones shown for the empty query.
 *
 * `enabled` defers every request until the picker is first opened.
 */
export function useEntityPickerSearch(enabled: boolean) {
  const { data: probe } = useSearchQuery(
    enabled
      ? { models: ["measure"], limit: 1, context: "entity-picker" }
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
        .filter((item) => item.model === "card" || item.model === "dataset")
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
