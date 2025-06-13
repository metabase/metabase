import { useQuestionVisualizationState } from "metabase/query_builder/components/chart-type-selector";

import { useQuestionContext } from "../context";

export const useQuestionVisualization = () => {
  const { question, updateQuestion } = useQuestionContext();

  return useQuestionVisualizationState({
    question,
    onUpdateQuestion: updateQuestion,
  });
};
