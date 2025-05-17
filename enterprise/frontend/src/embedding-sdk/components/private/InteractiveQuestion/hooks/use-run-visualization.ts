import { useMemo } from "react";

import { isQuestionDirty } from "metabase/query_builder/utils/question";
import { useRunVisualization as useRunVisualizationCore } from "metabase/querying/notebook/components/Notebook";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionContext } from "../context";

export const useRunVisualization = () => {
  const { question, updateQuestion, originalQuestion, queryQuestion } =
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
      await queryQuestion();
    },
  });
};
