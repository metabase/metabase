import type { Meta, StoryObj } from "@storybook/react";

import {
  VisualizationWrapper,
  createWaitForResizeToStopDecorator,
} from "__support__/storybook";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualization } from "metabase/viz-core";
import type { RawSeries, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { BoxPlot } from "./BoxPlot";

registerVisualization(BoxPlot);

function ResponsiveBoxPlot({
  width,
  height,
  settings = {},
}: {
  width: number;
  height: number;
  settings?: VisualizationSettings;
}) {
  const rawSeries: RawSeries = [
    {
      card: createMockCard({
        display: "boxplot",
        visualization_settings: {
          "graph.dimensions": ["category"],
          "graph.metrics": ["value"],
          "graph.show_values": true,
          "boxplot.show_values_mode": "all",
          "boxplot.points_mode": "outliers",
          "graph.y_axis.auto_range": true,
          ...settings,
        },
      }),
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "category",
            display_name: "Category",
            base_type: "type/Text",
          }),
          createMockColumn({
            name: "value",
            display_name: "Value",
            base_type: "type/Integer",
          }),
        ],
        rows: ["Alpha", "Beta", "Gamma"].flatMap((category, index) =>
          [1000, 2000, 2500, 3000, 4000, 15000].map((value) => [
            category,
            value * (index + 1),
          ]),
        ),
      }),
    },
  ];
  return (
    <VisualizationWrapper>
      <Box w={width} h={height}>
        <Visualization rawSeries={rawSeries} width={width} height={height} />
      </Box>
    </VisualizationWrapper>
  );
}

const meta = {
  title: "Viz/BoxPlot/Responsive axes",
  component: ResponsiveBoxPlot,
  decorators: [createWaitForResizeToStopDecorator()],
  args: { width: 500, height: 300 },
} satisfies Meta<typeof ResponsiveBoxPlot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {};
export const Medium: Story = { args: { width: 700, height: 420 } };
export const Large: Story = { args: { width: 960, height: 550 } };
export const ExplicitSettings: Story = {
  args: {
    settings: {
      "graph.label_value_formatting": "full",
      "graph.y_axis.split_number": 4,
      "graph.show_goal": true,
      "graph.goal_value": 60000,
    },
  },
};
