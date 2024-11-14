import {
  getSensibleVisualizations,
  useQuestionVisualizationState,
} from "metabase/query_builder/components/chart-type-selector";
import { useInteractiveQuestionContext } from "../context";
import { useMemo } from "react";

export const useChartTypeSelectors = () => {
  const { question, queryResults, updateQuestion } =
    useInteractiveQuestionContext();

  const result = queryResults?.[0];

  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(
    () => getSensibleVisualizations({ result }),
    [result],
  );

  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualizationState({
      question,
      onUpdateQuestion: updateQuestion,
    });

  return {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  };
};
