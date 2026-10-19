import type { StoryFn, StoryObj } from "@storybook/react";

import {
  IsomorphicVisualizationStory,
  SdkVisualizationWrapper,
  VisualizationWrapper,
  createWaitForChartsDecorator,
} from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualization } from "metabase/viz-core";
import type { RawSeries, Series } from "metabase-types/api";
import {
  createMockCard,
  createMockDatasetData,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { LineChart } from "./LineChart";

export default {
  title: "viz/LineChart",
  component: LineChart,
};

registerVisualization(LineChart);

const dataset_query = createMockStructuredDatasetQuery({
  query: { "source-table": 1 },
});

// Unjustified type cast. FIXME
const MOCK_SERIES = [
  {
    card: createMockCard({ id: 1, display: "line", dataset_query }),
    data: {
      cols: [
        StringColumn({ name: "Dimension" }),
        NumberColumn({ name: "Count" }),
      ],
      rows: [
        ["foo", 4],
        ["bar", 20],
        ["baz", 12],
      ],
    },
  },
] as Series;

// This story has become flaky on CI, so we're skipping it for now.
export const Default: StoryObj = {
  render: () => (
    <VisualizationWrapper>
      <Box h={500}>
        <Visualization rawSeries={MOCK_SERIES} width={500} />
      </Box>
    </VisualizationWrapper>
  ),

  parameters: {
    loki: { skip: true },
  },
};

// This story has become flaky on CI, so we're skipping it for now.
export const EmbeddingHugeFont: StoryObj = {
  render: () => {
    const theme: MetabaseTheme = {
      fontSize: "20px",
      components: { cartesian: { padding: "0.5rem 1rem" } },
    };

    return (
      <SdkVisualizationWrapper theme={theme}>
        <Box h={500}>
          <Visualization rawSeries={MOCK_SERIES} width={500} />
        </Box>
      </SdkVisualizationWrapper>
    );
  },

  parameters: {
    loki: { skip: true },
  },
};

const yAxisMaxEdgeSeries = (lowestValue: number): RawSeries => [
  {
    card: createMockCard({
      name: "Line near the y-axis max",
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["Month"],
        "graph.metrics": ["Count"],
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 0,
        "graph.y_axis.max": 100,
      },
    }),
    data: createMockDatasetData({
      cols: [StringColumn({ name: "Month" }), NumberColumn({ name: "Count" })],
      rows: [
        ["Jan", lowestValue],
        ["Feb", 110],
        ["Mar", 120],
      ],
    }),
  },
];

const YAxisMaxEdgeTemplate: StoryFn<{ rawSeries: RawSeries }> = (args) => (
  <IsomorphicVisualizationStory {...args} />
);

// About 1px above the max: within the line's 5px hit area, but under 0.5px of stroke reaches the plot.
export const LineJustAboveYAxisMax = {
  render: YAxisMaxEdgeTemplate,
  args: { rawSeries: yAxisMaxEdgeSeries(100.28) },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};

export const LineJustBelowYAxisMax = {
  render: YAxisMaxEdgeTemplate,
  args: { rawSeries: yAxisMaxEdgeSeries(99.72) },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};

const goalLineDataOffScreenSeries: RawSeries = [
  {
    card: createMockCard({
      name: "Goal line with data off screen",
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["Month"],
        "graph.metrics": ["Count"],
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 0,
        "graph.y_axis.max": 100,
        "graph.show_goal": true,
        "graph.goal_value": 50,
        "graph.goal_label": "Goal",
      },
    }),
    data: createMockDatasetData({
      cols: [StringColumn({ name: "Month" }), NumberColumn({ name: "Count" })],
      rows: [
        ["Jan", 110],
        ["Feb", 120],
        ["Mar", 130],
      ],
    }),
  },
];

// The goal line is not data, so it must not hide the off-screen warning.
export const GoalLineInsideRangeWithDataOffScreen = {
  render: YAxisMaxEdgeTemplate,
  args: { rawSeries: goalLineDataOffScreenSeries },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};
