import { useMemo } from "react";

import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import { isQuestionDirty } from "metabase/query_builder/utils/question";
import { useRunVisualization as useRunVisualizationCore } from "metabase/querying/notebook/components/Notebook";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../context";

export const useRunVisualization = () => {
  const { question, updateQuestion, originalQuestion, queryQuestion, onRun } =
    useInteractiveQuestionContext();

  const isDirty = useMemo(
    () => isQuestionDirty(question, originalQuestion),
    [question, originalQuestion],
  );

  return useRunVisualizationCore({
    question,
    isDirty,
    isResultDirty: true,
    updateQuestion: async (nextQuestion: Question) => {
      return await updateQuestion(nextQuestion, { run: false });
    },
    runQuestionQuery: async () => {
      const question = await queryQuestion();
      onRun?.(question && transformSdkQuestion(question));
    },
  });
};
