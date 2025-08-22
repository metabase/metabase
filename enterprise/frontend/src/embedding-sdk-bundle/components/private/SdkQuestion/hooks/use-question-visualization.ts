import { useQuestionVisualizationState } from "metabase/query_builder/components/chart-type-selector";

import { useSdkQuestionContext } from "../context";

export const useQuestionVisualization = () => {
  const { question, updateQuestion } = useSdkQuestionContext();

  return useQuestionVisualizationState({
    question,
    onUpdateQuestion: updateQuestion,
  });
};
