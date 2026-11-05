import type { StoryFn } from "@storybook/react";

import {
  IsomorphicVisualizationStory,
  createWaitForChartsDecorator,
} from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { registerVisualization } from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { BoxPlot } from "./BoxPlot";

export default {
  title: "viz/BoxPlot",
  component: BoxPlot,
};

registerVisualization(BoxPlot);

const Template: StoryFn<{ rawSeries: RawSeries }> = (args) => (
  <IsomorphicVisualizationStory {...args} />
);

const boxesOffScreenSeries: RawSeries = [
  {
    card: createMockCard({
      name: "Boxes off screen",
      display: "boxplot",
      visualization_settings: {
        "graph.dimensions": ["Category"],
        "graph.metrics": ["Value"],
        "graph.show_values": true,
        "boxplot.show_values_mode": "all",
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 40,
        "graph.y_axis.max": 60,
      },
    }),
    data: createMockDatasetData({
      cols: [
        StringColumn({ name: "Category" }),
        NumberColumn({ name: "Value" }),
      ],
      rows: [
        ["High", 100],
        ["High", 105],
        ["High", 110],
        ["Low", 0],
        ["Low", 5],
        ["Low", 10],
      ],
    }),
  },
];

// Value labels use transparent line series that cross the plot between boxes.
export const AllBoxesOffScreenWithValueLabels = {
  render: Template,
  args: { rawSeries: boxesOffScreenSeries },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};
