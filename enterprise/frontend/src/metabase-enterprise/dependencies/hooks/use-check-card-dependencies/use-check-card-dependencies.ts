import { useCallback } from "react";

import { useStore } from "metabase/lib/redux";
import type {
  UseCheckDependenciesProps,
  UseCheckDependenciesResult,
} from "metabase/plugins";
import { getSubmittableQuestion } from "metabase/query_builder/selectors";
import { useLazyCheckCardDependenciesQuery } from "metabase-enterprise/api";
import type Question from "metabase-lib/v1/Question";
import type { CheckCardDependenciesRequest } from "metabase-types/api";

import { useCheckDependencies } from "../use-check-dependencies";

export function useCheckCardDependencies({
  onSave,
}: UseCheckDependenciesProps<Question>): UseCheckDependenciesResult<Question> {
  const store = useStore();

  const getCheckDependenciesRequest = useCallback(
    (question: Question): CheckCardDependenciesRequest => {
      const submittableQuestion = getSubmittableQuestion(
        store.getState(),
        question,
      );
      const { id, type, dataset_query, result_metadata } =
        submittableQuestion.card();
      return { id, type, dataset_query, result_metadata };
    },
    [store],
  );

  return useCheckDependencies({
    getCheckDependenciesRequest,
    useLazyCheckDependenciesQuery: useLazyCheckCardDependenciesQuery,
    onSave,
  });
}
