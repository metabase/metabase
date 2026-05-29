import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";
import type {
  SdkQuestionId,
  SqlParameterValues,
} from "embedding-sdk-bundle/types";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type UseQuestionQueryOptions = {
  initialSqlParameters?: SqlParameterValues;
  enabled?: boolean;
};

export type UseQuestionQueryResult = {
  data: QueryQuestionResult | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
};

/**
 * Fetches the result of a saved question.
 *
 * Returns empty data until the SDK bundle has loaded and the user is
 * authenticated.
 *
 * @function
 * @category useQuestionQuery
 */
export const useQuestionQuery = (
  questionId: SdkQuestionId | null,
  { initialSqlParameters, enabled = true }: UseQuestionQueryOptions = {},
): UseQuestionQueryResult => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const loginStatus = useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getLoginStatus,
  );

  const queryQuestion =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.queryQuestion;

  const [data, setData] = useState<QueryQuestionResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const parameterKey = useMemo(
    () => JSON.stringify(initialSqlParameters ?? {}),
    [initialSqlParameters],
  );

  const initialSqlParametersRef = useRef(initialSqlParameters);

  useEffect(() => {
    initialSqlParametersRef.current = initialSqlParameters;
  }, [initialSqlParameters, parameterKey]);

  const refetch = useCallback(async () => {
    if (!enabled || questionId == null || !reduxStore || !queryQuestion) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextResult = await queryQuestion(reduxStore)({
        questionId,
        initialSqlParameters: initialSqlParametersRef.current,
      });

      setData(nextResult);
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, queryQuestion, questionId, reduxStore]);

  useEffect(() => {
    if (loginStatus?.status === "success") {
      refetch();
    }
  }, [loginStatus?.status, parameterKey, refetch]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};
