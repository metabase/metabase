import type { Meta, StoryObj } from "@storybook/react";

import {
  VisualizationWrapper,
  createWaitForChartsDecorator,
} from "__support__/storybook";
import { Box, Flex, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { AreaChart } from "metabase/visualizations/visualizations/AreaChart";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { BoxPlot } from "metabase/visualizations/visualizations/BoxPlot";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";
import { ScatterPlot } from "metabase/visualizations/visualizations/ScatterPlot";
import { WaterfallChart } from "metabase/visualizations/visualizations/WaterfallChart";
import { registerVisualization } from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";

import { axisPaddingSeries } from "./dashboard-x-axis-padding.stories-data";

for (const chart of [
  AreaChart,
  BarChart,
  BoxPlot,
  LineChart,
  ScatterPlot,
  WaterfallChart,
]) {
  registerVisualization(chart);
}

interface ChartExample {
  title: string;
  series: RawSeries;
  width: number;
  height?: number;
  isDashboard?: boolean;
}

function example(
  title: string,
  series: keyof typeof axisPaddingSeries,
  width: number,
  height = 260,
  isDashboard = true,
): ChartExample {
  return {
    title,
    series: axisPaddingSeries[series],
    width,
    height,
    isDashboard,
  };
}

function ChartComparison({ charts }: { charts: ChartExample[] }) {
  return (
    <VisualizationWrapper>
      <Flex gap="lg" p="lg" wrap="wrap" align="flex-start" w={1330}>
        {charts.map(
          ({ title, series, width, height = 260, isDashboard = true }) => (
            <Stack key={title} gap="sm" w={width}>
              <Text size="sm" fw="bold">
                {title}
              </Text>
              <Box w={width} h={height}>
                <Visualization
                  rawSeries={series}
                  width={width}
                  height={height}
                  isDashboard={isDashboard}
                  isQueryBuilder={!isDashboard}
                  gridSize={isDashboard ? { width: 8, height: 6 } : undefined}
                  hideLegend
                />
              </Box>
            </Stack>
          ),
        )}
      </Flex>
    </VisualizationWrapper>
  );
}

export default {
  title: "viz/CartesianChart/Dashboard X axis padding",
  component: ChartComparison,
  parameters: { loki: { skip: false } },
} satisfies Meta<typeof ChartComparison>;

type Story = StoryObj<typeof ChartComparison>;

export const SparseBars: Story = {
  decorators: [createWaitForChartsDecorator({ count: 3 })],
  args: {
    charts: [
      example("Small: two bars", "twoBars", 280, 220),
      example("Medium: four bars", "fourBars", 600, 220),
      example("Large: four bars", "fourBars", 1000, 280),
    ],
  },
};

export const GroupedAndStacked: Story = {
  decorators: [createWaitForChartsDecorator({ count: 2 })],
  args: {
    charts: [
      example("Grouped bars", "groupedBars", 600),
      example("Stacked bars", "stackedBars", 660),
    ],
  },
};

export const QuarterlyLinesAndAreas: Story = {
  decorators: [createWaitForChartsDecorator({ count: 3 })],
  args: {
    charts: [
      example("Small: quarterly line", "line", 280, 220),
      example("Medium: quarterly area", "area", 440, 220),
      example("Large: quarterly area", "area", 1000, 280),
    ],
  },
};

export const ScatterAndWaterfall: Story = {
  decorators: [createWaitForChartsDecorator({ count: 2 })],
  args: {
    charts: [
      example("Scatter with repeated categories", "scatter", 400),
      example("Waterfall with Total", "waterfall", 800),
    ],
  },
};

export const HistogramAndBoxPlot: Story = {
  decorators: [createWaitForChartsDecorator({ count: 2 })],
  args: {
    charts: [
      example("Histogram boundaries", "histogram", 500),
      example("Box plot with raw points", "boxplot", 760),
    ],
  },
};

export const BubbleEndpoints: Story = {
  decorators: [createWaitForChartsDecorator({ count: 2 })],
  args: {
    charts: [
      example("Large bubble at the endpoint", "largeEndpointBubble", 280),
      example("Large bubble in the middle", "largeMiddleBubble", 440),
    ],
  },
};

export const DashboardAndQuestion: Story = {
  decorators: [createWaitForChartsDecorator({ count: 2 })],
  args: {
    charts: [
      example("Dashboard card", "fourBars", 600, 220),
      example("Full-page question", "fourBars", 1000, 280, false),
    ],
  },
};
