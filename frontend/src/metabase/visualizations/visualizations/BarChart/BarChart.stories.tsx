import type { StoryFn } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

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
] as Series;

export const Default: StoryFn = () => (
  <VisualizationWrapper>
    <Box h={500}>
      <Visualization rawSeries={MOCK_SERIES} width={500} />
    </Box>
  </VisualizationWrapper>
);

// Example of how themes can be applied in the SDK.
export const EmbeddingHugeFont: StoryFn = () => {
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
};

export const Watermark: StoryFn = () => (
  <VisualizationWrapper
    initialStore={createMockState({
      settings: createMockSettingsState({
        "token-features": createMockTokenFeatures({
          "development-mode": true,
        }),
      }),
    })}
  >
    <Box h={500}>
      <Visualization rawSeries={MOCK_SERIES} width={500} />
    </Box>
  </VisualizationWrapper>
);
