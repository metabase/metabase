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
  settings: { "card.description": "Total invoices" },
});

// spec card sizes: size-100 through size-400 tiers
const CARD_SIZES = [
  { width: 82, height: 82 },
  { width: 126, height: 82 },
  { width: 170, height: 82 },
  { width: 256, height: 126 },
  { width: 345, height: 170 },
  { width: 433, height: 214 },
];

export const Default: StoryFn = () => (
  <VisualizationWrapper>
    <Flex gap="lg" align="flex-start" wrap="wrap" p="lg">
      {CARD_SIZES.map(({ width, height }) => (
        <Box
          key={`${width}x${height}`}
          w={width}
          h={height}
          style={{
            borderRadius: 12,
            border: "1px solid var(--mb-color-border-neutral)",
          }}
        >
          <Visualization rawSeries={MOCK_SERIES} showTitle width={width} />
        </Box>
      ))}
    </Flex>
  </VisualizationWrapper>
);

const MOCK_MULTI_COMPARISON_SERIES = mockSeries({
  rows: MOCK_ROWS,
  insights: [{ unit: "month", col: "Count" }],
  name: "Last invoice",
  settings: { "card.description": "Total invoices" },
  comparisonTypes: [
    { id: "1", type: "previousPeriod" },
    { id: "2", type: "periodsAgo", value: 2 },
    { id: "3", type: "staticNumber", value: 90, label: "Target" },
  ],
});

// short dashcards show the compact row with a "+N" badge; the extra
// comparisons live in the hover panel
export const DashcardMultipleComparisons: StoryFn = () => (
  <VisualizationWrapper>
    <Flex gap="lg" align="flex-start" wrap="wrap" p="lg">
      {CARD_SIZES.map(({ width, height }) => (
        <Box
          key={`${width}x${height}`}
          w={width}
          h={height}
          style={{
            borderRadius: 12,
            border: "1px solid var(--mb-color-border-neutral)",
          }}
        >
          <Visualization
            rawSeries={MOCK_MULTI_COMPARISON_SERIES}
            showTitle
            width={width}
          />
        </Box>
      ))}
    </Flex>
  </VisualizationWrapper>
);

// spec min-heights at which a dashcard lists every comparison, per tier
const TALL_CARD_SIZES = [
  { width: 256, height: 240 },
  { width: 345, height: 256 },
  { width: 433, height: 264 },
  { width: 521, height: 288 },
  { width: 620, height: 320 },
];

// the box border takes a pixel on each side, so the box is 2px larger than
// the size the visualization inside gets measured at
const BOX_BORDER_WIDTH = 2;

export const DashcardMultipleComparisonsTall: StoryFn = () => (
  <VisualizationWrapper>
    <Flex gap="lg" align="flex-start" p="lg" wrap="wrap">
      {TALL_CARD_SIZES.map(({ width, height }) => (
        <Box
          key={`${width}x${height}`}
          w={width + BOX_BORDER_WIDTH}
          h={height + BOX_BORDER_WIDTH}
          style={{
            borderRadius: 12,
            border: "1px solid var(--mb-color-border-neutral)",
          }}
        >
          <Visualization
            rawSeries={MOCK_MULTI_COMPARISON_SERIES}
            showTitle
            width={width}
            height={height}
          />
        </Box>
      ))}
    </Flex>
  </VisualizationWrapper>
);

// a value the card cannot compact truncates after the trend symbol
const MOCK_LONG_VALUE_SERIES = mockSeries({
  rows: [
    ["2019-10-01T00:00:00", 9007199254740000],
    ["2019-11-01T00:00:00", Number.MAX_SAFE_INTEGER],
  ],
  insights: [{ unit: "month", col: "Count" }],
  name: "Last invoice",
  settings: { "scalar.compact_primary_number": false },
});

// the narrowest card cannot fit even the compact value
const LONG_VALUE_CARD_SIZES = [{ width: 170, height: 126 }, ...CARD_SIZES];

export const DashcardLongValue: StoryFn = () => (
  <VisualizationWrapper>
    <Flex gap="lg" align="flex-start" p="lg" wrap="wrap">
      {LONG_VALUE_CARD_SIZES.map(({ width, height }) => (
        <Box
          key={`${width}x${height}`}
          w={width}
          h={height}
          style={{
            borderRadius: 12,
            border: "1px solid var(--mb-color-border-neutral)",
          }}
        >
          <Visualization
            rawSeries={MOCK_LONG_VALUE_SERIES}
            showTitle
            width={width}
          />
        </Box>
      ))}
    </Flex>
  </VisualizationWrapper>
);

// a single comparison on a full-page question renders inline with the trend
// symbol and the full comparison value
export const QueryBuilderSingleComparison: StoryFn = () => (
  <VisualizationWrapper>
    <Box w={800} h={400}>
      <Visualization rawSeries={MOCK_SERIES} width={800} isQueryBuilder />
    </Box>
  </VisualizationWrapper>
);

// several comparisons on a full-page question render as a date line plus the
// full list — no hover panel needed
export const QueryBuilderMultipleComparisons: StoryFn = () => (
  <VisualizationWrapper>
    <Box w={800} h={400}>
      <Visualization
        rawSeries={MOCK_MULTI_COMPARISON_SERIES}
        width={800}
        isQueryBuilder
      />
    </Box>
  </VisualizationWrapper>
);

// public/embedded question views get the same treatment as the query builder
export const StandaloneQuestionSingleComparison: StoryFn = () => (
  <VisualizationWrapper>
    <Box w={800} h={400}>
      <Visualization rawSeries={MOCK_SERIES} width={800} isStandaloneQuestion />
    </Box>
  </VisualizationWrapper>
);

export const StandaloneQuestionMultipleComparisons: StoryFn = () => (
  <VisualizationWrapper>
    <Box w={800} h={400}>
      <Visualization
        rawSeries={MOCK_MULTI_COMPARISON_SERIES}
        width={800}
        isStandaloneQuestion
      />
    </Box>
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
