import type { Story } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import type { MetabaseTheme } from "embedding-sdk";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { createMockCard } from "metabase-types/api/mocks";

import { BarChart } from "./BarChart";

export default {
  title: "viz/BarChart",
  component: BarChart,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(BarChart);

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
];

export const Default: Story = () => (
  <VisualizationWrapper>
    <Box h={500}>
      <Visualization rawSeries={MOCK_SERIES} width={500} />
    </Box>
  </VisualizationWrapper>
);

// Example of how themes can be applied in the SDK.
export const EmbeddingTemplate: Story = () => {
  const theme: MetabaseTheme = { fontSize: "20px" };

  return (
    <SdkVisualizationWrapper theme={theme}>
      <Box h={500}>
        <Visualization rawSeries={MOCK_SERIES} width={500} />
      </Box>
    </SdkVisualizationWrapper>
  );
};
