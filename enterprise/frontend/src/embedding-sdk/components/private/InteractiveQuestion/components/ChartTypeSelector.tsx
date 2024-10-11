import CS from "metabase/css/core/index.css";
import {
  ChartTypeSettings,
  useChartTypeVisualizations,
} from "metabase/query_builder/components/chart-type-selector";
import type { CardDisplayType } from "metabase-types/api";

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

export const ChartTypeSelector = ({
  onChange,
}: {
  onChange?: (display: CardDisplayType) => void;
}) => {
  const {
    selectedVisualization,
    updateQuestionVisualization,
    sensibleVisualizations,
    nonSensibleVisualizations,
  } = useChartTypeSelectors();

  return (
    <ChartTypeSettings
      w="20rem"
      p="xl"
      h="100%"
      className={CS.overflowYScroll}
      sensibleVisualizations={sensibleVisualizations}
      nonSensibleVisualizations={nonSensibleVisualizations}
      selectedVisualization={selectedVisualization}
      onSelectVisualization={(display: CardDisplayType) => {
        onChange?.(display);
        updateQuestionVisualization(display);
      }}
    />
  );
};
