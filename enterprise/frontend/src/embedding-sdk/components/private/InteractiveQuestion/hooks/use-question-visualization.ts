import { useQuestionVisualizationState } from "metabase/query_builder/components/chart-type-selector";

import { useInteractiveQuestionContext } from "../context";

export const useQuestionVisualization = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  return useQuestionVisualizationState({
    question,
    onUpdateQuestion: updateQuestion,
  });
};
