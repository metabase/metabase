import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  SdkQuestionId,
  SqlParameterValues,
} from "embedding-sdk-bundle/types";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

import type { InferSchema, QueryData, QuestionSchema } from "../data-schema";
import { mapQueryData } from "../data-schema";

export type UseQuestionQueryOptions = {
  parameters?: SqlParameterValues;
  initialSqlParameters?: SqlParameterValues;
  enabled?: boolean;
};

export type UseQuestionQueryResult<TQuestion = unknown> = {
  data: QueryData<InferSchema<TQuestion, Record<string, unknown>>> | null;
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
export const useQuestionQuery = <
  TQuestion extends QuestionSchema | undefined = undefined,
>(
  questionId: SdkQuestionId | null,
  {
    parameters,
    initialSqlParameters,
    enabled = true,
  }: UseQuestionQueryOptions = {},
): UseQuestionQueryResult<TQuestion> => {
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

  const [data, setData] =
    useState<UseQuestionQueryResult<TQuestion>["data"]>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const sqlParameters = parameters ?? initialSqlParameters;

  const parameterKey = useMemo(
    () => JSON.stringify(sqlParameters ?? {}),
    [sqlParameters],
  );

  const initialSqlParametersRef = useRef(sqlParameters);

  useEffect(() => {
    initialSqlParametersRef.current = sqlParameters;
  }, [sqlParameters, parameterKey]);

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

      setData(mapQueryData(nextResult));
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
