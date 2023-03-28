import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAsyncFn } from "react-use";
import {
  MetabotFeedbackPayload,
  MetabotFeedbackType,
} from "metabase-types/api";
import { MetabotApi } from "metabase/services";
import { maybeGetNativeQueryText } from "metabase/metabot/utils/question";
import Question from "metabase-lib/Question";
import MetabotQueryForm from "../MetabotQueryForm";
import MetabotFeedback from "../MetabotFeedback";
import { QueryResults } from "./types";

const submitFeedback = async (feedbackPayload: MetabotFeedbackPayload) =>
  await MetabotApi.sendFeedback(feedbackPayload);

export const useFeedbackFlow = (
  queryResults?: QueryResults,
  onSubmit?: (correctedQuestion: Question) => void,
) => {
  const [, handleSubmit] = useAsyncFn(submitFeedback);
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);
  const [feedbackType, setFeedbackType] = useState<
    MetabotFeedbackType | undefined
  >();
  const isFeedbackVisible = queryResults != null;

  useEffect(() => {
    setIsFeedbackSubmitted(false);
    setFeedbackType(undefined);
  }, [queryResults]);

  const handleFeedbackSubmit = useCallback(
    async (message?: string, correct_sql?: string) => {
      try {
        if (queryResults == null || feedbackType == null) {
          return;
        }

        const sql = maybeGetNativeQueryText(queryResults.question);

        if (!sql) {
          return;
        }

        await handleSubmit({
          feedback: feedbackType,
          sql,
          prompt: queryResults.prompt,
          message,
          correct_sql,
        });
      } finally {
        // TODO: add error handling
        setIsFeedbackSubmitted(true);
        setFeedbackType(undefined);
      }
    },
    [feedbackType, handleSubmit, queryResults],
  );

  const handleSubmitQueryForm = useCallback(
    async (question: Question) => {
      const queryText = maybeGetNativeQueryText(question);
      await handleFeedbackSubmit(undefined, queryText);
      onSubmit?.(question);
    },
    [handleFeedbackSubmit, onSubmit],
  );

  const handleCancelQueryForm = useCallback(
    () => setFeedbackType(undefined),
    [],
  );

  const shouldShowQueryForm = feedbackType === "invalid-sql";

  const feedbackContent = useMemo(() => {
    if (!isFeedbackVisible) {
      return null;
    }

    return shouldShowQueryForm ? (
      <MetabotQueryForm
        question={queryResults?.question}
        onCancel={handleCancelQueryForm}
        onSubmit={handleSubmitQueryForm}
      />
    ) : (
      <MetabotFeedback
        type={feedbackType}
        onTypeChange={setFeedbackType}
        isSubmitted={isFeedbackSubmitted}
        onSubmit={handleFeedbackSubmit}
      />
    );
  }, [
    isFeedbackVisible,
    shouldShowQueryForm,
    queryResults?.question,
    handleCancelQueryForm,
    handleSubmitQueryForm,
    feedbackType,
    isFeedbackSubmitted,
    handleFeedbackSubmit,
  ]);

  return {
    feedbackContent,
    isQueryFormVisible: isFeedbackVisible && shouldShowQueryForm,
  };
};
