import { Box } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";

import { ChartTypeDropdownInner } from "./ChartTypeDropdown";

registerVisualizations();

export default {
  title: "EmbeddingSDK/SdkQuestion/ChartTypeDropdownInner",
  component: ChartTypeDropdownInner,
  parameters: {
    layout: "fullscreen",
  },
};

export const QuestionChartTypeSelectorList = {
  render() {
    return (
      <>
        <ChartTypeDropdownInner
          defaultOpened
          selectedVisualization="table"
          updateQuestionVisualization={() => {}}
          sensibleVisualizations={["table", "object"]}
          nonSensibleVisualizations={[
            "bar",
            "line",
            "pie",
            "scalar",
            "row",
            "area",
            "combo",
            "pivot",
            "smartscalar",
            "gauge",
            "progress",
            "funnel",
            "map",
            "scatter",
            "waterfall",
            "sankey",
          ]}
        />
        <Box
          pos="absolute"
          // the space between the popover and the target element
          mt="8px"
          w={300}
          h={600}
        />
      </>
    );
  },
};
