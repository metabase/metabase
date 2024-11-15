import { useEffect, useState } from "react";

import { loadStaticQuestion } from "embedding-sdk/lib/load-static-question";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { defer } from "metabase/lib/promise";
import type Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";

type QuestionState = {
  loading: boolean;
  card: Card | null;
  result: Dataset | null;
  error: GenericErrorResponse | null;
};

export function useLoadStaticQuestion(
  questionId: number | null,
  parameterValues?: Record<string, string | number>,
) {
  const [questionState, setQuestionState] = useState<QuestionState>({
    loading: false,
    card: null,
    result: null,
    error: null,
  });

  const updateQuestion = (newQuestion: Question) =>
    setQuestionState(state => ({
      ...state,
      card: newQuestion.card(),
      loading: false,
      error: null,
    }));

  useEffect(() => {
    const cancelDeferred = defer();

    async function loadCardData() {
      setQuestionState(state => ({ ...state, loading: true }));

      if (!questionId) {
        return;
      }

      try {
        const { card, result } = await loadStaticQuestion({
          questionId,
          parameterValues,
          cancelDeferred,
        });

        setQuestionState({
          card,
          result,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (typeof error === "object") {
          setQuestionState({
            result: null,
            card: null,
            loading: false,
            error,
          });
        } else {
          console.error("error loading static question", error);
        }
      }
    }

    loadCardData();

    return () => {
      // cancel pending requests upon unmount
      cancelDeferred.resolve();
    };
  }, [questionId, parameterValues]);

  return { ...questionState, updateQuestion };
}
