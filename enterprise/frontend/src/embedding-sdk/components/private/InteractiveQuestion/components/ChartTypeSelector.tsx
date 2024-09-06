import {
  ChartTypeSettings,
  type UseChartTypeVisualizationsProps,
  useChartTypeVisualizations,
} from "metabase/query_builder/components/chart-type-selector";
import { Stack } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

const useChartTypeSelectorsInner = ({
  question,
  result,
  onUpdateQuestion,
}: UseChartTypeVisualizationsProps) => {
  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeVisualizations({
    question,
    result,
    onUpdateQuestion,
  });

  return {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  };
};

// Public facing hook so users can create their own selectors for their UI.
// Will document once this PR is ready to go.
export const useChartTypeSelectors = () => {
  const { question, queryResults, updateQuestion } =
    useInteractiveQuestionContext();

  return useChartTypeSelectorsInner({
    question,
    result: queryResults?.[0],
    onUpdateQuestion: updateQuestion,
  });
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
