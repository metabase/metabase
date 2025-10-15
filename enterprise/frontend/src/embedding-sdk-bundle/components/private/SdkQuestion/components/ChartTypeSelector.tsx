import { useQuestionVisualization } from "embedding-sdk-bundle/components/private/SdkQuestion/hooks/use-question-visualization";
import CS from "metabase/css/core/index.css";
import { ChartTypeSettings } from "metabase/query_builder/components/chart-type-selector";
import type { StackProps } from "metabase/ui";

import { useSensibleVisualizations } from "../hooks/use-sensible-visualizations";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type ChartTypeSelectorProps = StackProps;

/**
 * Detailed chart type selection interface with recommended visualization options.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const ChartTypeSelector = ({
  ...stackProps
}: ChartTypeSelectorProps) => {
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
      onSelectVisualization={updateQuestionVisualization}
    />
  );
};
