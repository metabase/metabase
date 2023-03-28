import React, { useCallback, useEffect, useState } from "react";
import { useAsyncFn } from "react-use";
import { MetabotFeedbackType } from "metabase-types/api";
import { maybeGetNativeQueryText } from "metabase/metabot/utils/question";
import { MetabotApi } from "metabase/services";
import Question from "metabase-lib/Question";
import MetabotFeedbackForm from "../MetabotFeedbackForm";
import MetabotQueryForm from "../MetabotQueryForm";
import { QueryResults } from "../Metabot";

interface MetabotFeedbackProps {
  results: QueryResults;
  feedbackType?: MetabotFeedbackType;
  onSubmit?: (correctedQuestion: Question) => void;
  onChangeFeedbackType: (feedbackType?: MetabotFeedbackType) => void;
}

const MetabotFeedback = ({
  results,
  feedbackType,
  onChangeFeedbackType,
  onSubmit,
}: MetabotFeedbackProps) => {
  const [, handleSubmit] = useAsyncFn(MetabotApi.sendFeedback);
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);

  const isFeedbackVisible = results != null;

  useEffect(() => {
    setIsFeedbackSubmitted(false);
    onChangeFeedbackType(undefined);
  }, [onChangeFeedbackType, results]);

  const handleFeedbackSubmit = useCallback(
    async (message?: string, correct_sql?: string) => {
      if (results == null || feedbackType == null) {
        return;
      }

      const sql = maybeGetNativeQueryText(results.question);

      if (!sql) {
        return;
      }

      await handleSubmit({
        feedback: feedbackType,
        sql,
        prompt: results.prompt,
        message,
        correct_sql,
      });

      // TODO: add error handling once BE is ready
      setIsFeedbackSubmitted(true);
      onChangeFeedbackType(undefined);
    },
    [feedbackType, handleSubmit, onChangeFeedbackType, results],
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
    () => onChangeFeedbackType(undefined),
    [onChangeFeedbackType],
  );

  const shouldShowQueryForm = feedbackType === "invalid-sql";

  if (!isFeedbackVisible) {
    return null;
  }

  return shouldShowQueryForm ? (
    <MetabotQueryForm
      question={results.question}
      onCancel={handleCancelQueryForm}
      onSubmit={handleSubmitQueryForm}
    />
  ) : (
    <MetabotFeedbackForm
      type={feedbackType}
      onTypeChange={onChangeFeedbackType}
      isSubmitted={isFeedbackSubmitted}
      onSubmit={handleFeedbackSubmit}
    />
  );
};

export default MetabotFeedback;
