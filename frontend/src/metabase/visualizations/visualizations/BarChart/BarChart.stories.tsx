import type { StoryFn } from "@storybook/react";

import { createMockSettingsState, createMockState } from "__support__/state";
import {
  IsomorphicVisualizationStory,
  VisualizationWrapper,
  createWaitForChartsDecorator,
} from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualization } from "metabase/viz-core";
import type { RawSeries, Series } from "metabase-types/api";
import {
  createMockCard,
  createMockDatasetData,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { BarChart } from "./BarChart";

export default {
  title: "viz/BarChart",
  component: BarChart,
};

registerVisualization(BarChart);

// Unjustified type cast. FIXME
const MOCK_SERIES = [
  {
    card: createMockCard({ name: "Card", display: "bar" }),
    data: {
      cols: [
        StringColumn({ name: "Dimension" }),
        NumberColumn({ name: "Count" }),
      ],
      rows: [
        ["foo", 1],
        ["bar", 2],
      ],
    },
  },
] as Series;

const DefaultTemplate: StoryFn = () => (
  <VisualizationWrapper>
    <Box h={500}>
      <Visualization rawSeries={MOCK_SERIES} width={500} />
    </Box>
  </VisualizationWrapper>
);

const WatermarkTemplate: StoryFn = () => (
  <VisualizationWrapper
    initialStore={createMockState({
      settings: createMockSettingsState({
        "token-features": createMockTokenFeatures({
          development_mode: true,
        }),
      }),
    })}
  >
    <Box h={500}>
      <Visualization rawSeries={MOCK_SERIES} width={500} />
    </Box>
  </VisualizationWrapper>
);

export const Default = {
  render: DefaultTemplate,
  parameters: {
    loki: { skip: true },
  },
};

export const Watermark = {
  render: WatermarkTemplate,
  parameters: {
    loki: { skip: true },
  },
};

const splitPanelsSeries = (min: number, max: number) =>
  // Unjustified type cast. FIXME
  [
    {
      card: createMockCard({
        name: "Split panels",
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["Month"],
          "graph.metrics": ["Small", "Large"],
          "graph.split_panels": true,
          "graph.y_axis.auto_range": false,
          "graph.y_axis.min": min,
          "graph.y_axis.max": max,
        },
      }),
      data: {
        cols: [
          StringColumn({ name: "Month" }),
          NumberColumn({ name: "Small" }),
          NumberColumn({ name: "Large" }),
        ],
        rows: [
          ["Jan", 10, 100],
          ["Feb", 12, 140],
          ["Mar", 11, 180],
        ],
      },
    },
  ] as unknown as Series;

const SplitPanelsTemplate: StoryFn<{ rawSeries: Series }> = (args) => (
  <IsomorphicVisualizationStory {...args} />
);

export const SplitPanelsFirstPanelEmpty = {
  render: SplitPanelsTemplate,
  args: { rawSeries: splitPanelsSeries(120, 160) },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};

export const SplitPanelsAllPanelsEmpty = {
  render: SplitPanelsTemplate,
  args: { rawSeries: splitPanelsSeries(300, 400) },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};

const RawSeriesTemplate: StoryFn<{ rawSeries: RawSeries }> = (args) => (
  <IsomorphicVisualizationStory {...args} />
);

const comboSplitPanelsSeries: RawSeries = [
  {
    card: createMockCard({
      name: "Split panels combo",
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["Month"],
        "graph.metrics": ["Small", "Large"],
        "graph.split_panels": true,
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 50,
        "graph.y_axis.max": 60,
        series_settings: { Large: { display: "line" } },
      },
    }),
    data: createMockDatasetData({
      cols: [
        StringColumn({ name: "Month" }),
        NumberColumn({ name: "Small" }),
        NumberColumn({ name: "Large" }),
      ],
      rows: [
        ["Jan", 1, 100],
        ["Feb", 2, 140],
        ["Mar", 1, 180],
      ],
    }),
  },
];

// The line panel gets a transparent alignment bar that spans the panel.
export const SplitPanelsComboAllPanelsEmpty = {
  render: RawSeriesTemplate,
  args: { rawSeries: comboSplitPanelsSeries },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};

const shortBarsSeries: RawSeries = [
  {
    card: createMockCard({
      name: "Short bars",
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["Month"],
        "graph.metrics": ["Count"],
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 0,
        "graph.y_axis.max": 1000,
      },
    }),
    data: createMockDatasetData({
      cols: [StringColumn({ name: "Month" }), NumberColumn({ name: "Count" })],
      rows: [
        ["Jan", 1],
        ["Feb", 2],
        ["Mar", 4],
      ],
    }),
  },
];

// Bars under 2.5px tall are still painted, so no warning.
export const ShortBarsAtBaseline = {
  render: RawSeriesTemplate,
  args: { rawSeries: shortBarsSeries },
  decorators: [createWaitForChartsDecorator({ count: 1 })],
};
