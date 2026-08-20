import { useQuestionVisualizationState } from "metabase/query_builder";

import { useSdkQuestionContext } from "../context";

export const useQuestionVisualization = () => {
  const { question, updateQuestion } = useSdkQuestionContext();

  return useQuestionVisualizationState({
    question,
    onUpdateQuestion: updateQuestion,
  });
};
