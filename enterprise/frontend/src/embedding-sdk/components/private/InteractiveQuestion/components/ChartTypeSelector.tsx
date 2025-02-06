import { useQuestionVisualization } from "embedding-sdk/components/private/InteractiveQuestion/hooks/use-question-visualization";
import CS from "metabase/css/core/index.css";
import { ChartTypeSettings } from "metabase/query_builder/components/chart-type-selector";
import type { StackProps } from "metabase/ui";
import type { CardDisplayType } from "metabase-types/api";

import { useSensibleVisualizations } from "../hooks/use-sensible-visualizations";

export const ChartTypeSelector = ({
  onChange,
  ...stackProps
}: {
  onChange?: (display: CardDisplayType) => void;
} & StackProps) => {
  const { sensibleVisualizations, nonSensibleVisualizations } =
    useSensibleVisualizations();

  const { selectedVisualization, updateQuestionVisualization } =
    useQuestionVisualization();

  return (
    <ChartTypeSettings
      w="20rem"
      p="xl"
      h="100%"
      className={CS.overflowYScroll}
      {...stackProps}
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
