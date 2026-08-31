import type { StoryFn } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box, Flex } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualization } from "metabase/viz-core";

import { SmartScalar } from "./SmartScalar";
import { mockSeries } from "./tests/test-mocks";

export default {
  title: "viz/SmartScalar",
  component: SmartScalar,
};

registerVisualization(SmartScalar);

const MOCK_ROWS = [
  ["2019-10-01T00:00:00", 100],
  ["2019-11-01T00:00:00", 120],
];

const MOCK_SERIES = mockSeries({
  rows: MOCK_ROWS,
  insights: [{ unit: "month", col: "Count" }],
  name: "Last invoice",
});

// spec card sizes: size-200, size-300, and size-400 tiers
const CARD_SIZES = [
  { width: 256, height: 126 },
  { width: 345, height: 170 },
  { width: 433, height: 214 },
];

export const Default: StoryFn = () => (
  <VisualizationWrapper>
    <Flex gap="lg" align="flex-start" p="lg">
      {CARD_SIZES.map(({ width, height }) => (
        <Box
          key={`${width}x${height}`}
          w={width}
          h={height}
          style={{
            borderRadius: 12,
            boxShadow: "0 0 0 0.5px var(--mb-color-shadow-default)",
          }}
        >
          <Visualization rawSeries={MOCK_SERIES} showTitle width={width} />
        </Box>
      ))}
    </Flex>
  </VisualizationWrapper>
);

// Example of how themes can be applied in the SDK.
export const EmbeddingTheme: StoryFn = () => {
  const theme: MetabaseTheme = {
    colors: {
      positive: "#4834d4",
      negative: "#e84118",
    },
    components: {
      number: {
        value: { fontSize: "24px", lineHeight: "20px" },
      },
    },
  };

  return (
    <SdkVisualizationWrapper theme={theme}>
      <Box w={433} h={214}>
        <Visualization rawSeries={MOCK_SERIES} width={433} />
      </Box>
    </SdkVisualizationWrapper>
  );
};
