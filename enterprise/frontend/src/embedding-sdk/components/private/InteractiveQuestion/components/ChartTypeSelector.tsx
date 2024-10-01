import _ from "underscore";

import {
  ChartTypeSettings,
  useChartTypeVisualizations,
} from "metabase/query_builder/components/chart-type-selector";
import { Stack } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

// Public facing hook so users can create their own selectors for their UI.
// Will document once this PR is ready to go.
export const useChartTypeSelectors = () => {
  const { question, queryResults, updateQuestion } =
    useInteractiveQuestionContext();

  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeVisualizations({
    question,
    result: queryResults?.[0],
    onUpdateQuestion: updateQuestion,
  });

  return {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  };
};

export const ChartTypeSelector = () => {
  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeSelectors();

  return (
    <Stack w="30rem" p="xl">
      <ChartTypeSettings
        sensibleVisualizations={sensibleVisualizations}
        nonSensibleVisualizations={nonSensibleVisualizations}
        selectedVisualization={selectedVisualization}
        onSelectVisualization={updateQuestionVisualization}
      />
    </Stack>
  );
};
