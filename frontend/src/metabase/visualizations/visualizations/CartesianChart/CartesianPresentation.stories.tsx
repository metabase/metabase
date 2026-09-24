import type { Meta, StoryObj } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
  createWaitForResizeToStopDecorator,
} from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { registerVisualization } from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

registerVisualization(BarChart);

const series: RawSeries = [
  {
    card: createMockCard({
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["category"],
        "graph.metrics": ["total"],
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
          name: "total",
          display_name: "Total",
          base_type: "type/Integer",
        }),
      ],
      rows: [
        ["Alpha", 1200],
        ["Beta", 2400],
        ["Gamma", 3600],
      ],
    }),
  },
];

function ChartContexts({ width, height }: { width: number; height: number }) {
  return (
    <VisualizationWrapper>
      <Stack gap="md" w={width}>
        {["question", "dashboard", "document"].map((context) => (
          <Box key={context}>
            <Text>
              {context} ({width} × {height})
            </Text>
            <Box w={width} h={height}>
              <Visualization
                rawSeries={series}
                width={width}
                height={height}
                isDashboard={context === "dashboard"}
                isDocument={context === "document"}
              />
            </Box>
          </Box>
        ))}
      </Stack>
    </VisualizationWrapper>
  );
}

const meta = {
  title: "Viz/Cartesian presentation",
  component: ChartContexts,
  args: { width: 440, height: 280 },
  decorators: [createWaitForResizeToStopDecorator()],
} satisfies Meta<typeof ChartContexts>;
export default meta;

type Story = StoryObj<typeof meta>;

export const SmallContexts: Story = { args: { width: 440, height: 280 } };
export const MediumContexts: Story = { args: { width: 700, height: 400 } };
export const LargeContexts: Story = { args: { width: 960, height: 500 } };

function SdkChart({ theme }: { theme: MetabaseTheme }) {
  return (
    <SdkVisualizationWrapper theme={theme}>
      <Box w={640} h={360} bg="background-primary">
        <Visualization rawSeries={series} width={640} height={360} />
      </Box>
    </SdkVisualizationWrapper>
  );
}

export const SdkLight: Story = {
  render: () => <SdkChart theme={{ preset: "light" }} />,
};
export const SdkDark: Story = {
  render: () => <SdkChart theme={{ preset: "dark" }} />,
};
export const SdkCustomBorder: Story = {
  render: () => <SdkChart theme={{ colors: { border: "seagreen" } }} />,
};
export const SdkCustomGridlineAndFont: Story = {
  render: () => (
    <SdkChart
      theme={{
        fontSize: "20px",
        components: {
          cartesian: {
            splitLine: { lineStyle: { color: "var(--mb-color-brand)" } },
          },
        },
      }}
    />
  ),
};
