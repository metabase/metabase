import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import registerVisualizations from "metabase/visualizations/register";

import { ChartTypeDropdownInner } from "./ChartTypeDropdown";

registerVisualizations();

export default {
  title: "EmbeddingSDK/SdkQuestion/ChartTypeDropdownInner",
  component: ChartTypeDropdownInner,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
};

export const QuestionChartTypeSelectorList = {
  render() {
    return (
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
    );
  },
};
