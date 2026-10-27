// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import { expect, userEvent, within } from "@storybook/test";

import { VisualizationWrapper } from "__support__/storybook";
import {
  DateTimeColumn,
  NumberColumn,
  StringColumn,
} from "__support__/visualizations";
import { Box, Flex, SimpleGrid } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualization } from "metabase/viz-core";
import type { DatasetColumn, RowValue, Series } from "metabase-types/api";
import {
  createMockCard,
  createMockSegmentFormatting,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { Scalar } from "./Scalar";

export default {
  title: "viz/Scalar",
  component: Scalar,
};

registerVisualization(Scalar);

const COMPACT_CARD_SIZES = [
  { width: 82, height: 82 },
  { width: 106, height: 82 },
  { width: 126, height: 82 },
  { width: 170, height: 82 },
  { width: 82, height: 126 },
];

export const CompactSizes = () => (
  <VisualizationWrapper>
    <SimpleGrid cols={5} spacing="lg" p="lg" w={1000}>
      {[
        { name: "Revenue", description: null },
        { name: "Revenue", description: "Total revenue" },
        { name: "Revenue from all orders", description: "Total revenue" },
      ].flatMap(({ name, description }) =>
        COMPACT_CARD_SIZES.map(({ width, height }) => (
          <Box
            key={`${name}-${description}-${width}-${height}`}
            w={width}
            h={height}
            style={{
              borderRadius: 12,
              border: "1px solid var(--mb-color-border-neutral)",
            }}
          >
            <Visualization
              rawSeries={[
                createMockSingleSeries(
                  { name, description, display: "scalar" },
                  {
                    data: {
                      cols: [NumberColumn({ name: "Count" })],
                      rows: [[1510621.68]],
                    },
                  },
                ),
              ]}
              showTitle
              width={width}
            />
          </Box>
        )),
      )}
    </SimpleGrid>
  </VisualizationWrapper>
);

// Unjustified type cast. FIXME
const MOCK_SERIES = [
  {
    card: createMockCard({ name: "Card", display: "scalar" }),
    data: {
      cols: [NumberColumn({ name: "Count" })],
      rows: [[67]],
    },
  },
] as Series;

const SETTINGS = {
  "scalar.segments": [
    createMockSegmentFormatting({
      label: "bad",
      min: 0,
      max: 50,
      color: "#F00",
    }),
    createMockSegmentFormatting({
      label: "good",
      min: 50,
      max: 100,
      color: "#0F0",
    }),
  ],
};

export const WithFormattingAndHover = () => {
  return (
    <VisualizationWrapper>
      <SimpleGrid cols={2} w={500}>
        <Box h={250}>
          <Visualization rawSeries={MOCK_SERIES} width={500} />
        </Box>
        <Box h={250}>
          <Visualization
            rawSeries={MOCK_SERIES}
            width={250}
            settings={SETTINGS}
          />
        </Box>
        <Box h={250}>
          <Visualization
            rawSeries={MOCK_SERIES}
            width={250}
            settings={SETTINGS}
          />
        </Box>
      </SimpleGrid>
    </VisualizationWrapper>
  );
};

WithFormattingAndHover.play = async ({
  canvasElement,
}: {
  canvasElement: HTMLCanvasElement;
}) => {
  const asyncCallback = createAsyncCallback();
  try {
    // Unjustified type cast. FIXME
    const canvas = within(canvasElement.parentElement as HTMLElement);
    const value = (await canvas.findAllByTestId("scalar-value"))[2];

    await userEvent.hover(value);
    value.classList.add("pseudo-hover");

    await expect(await canvas.findByRole("tooltip")).toBeInTheDocument();
    expect(value.classList.contains("pseudo-hover")).toBe(true);
  } finally {
    asyncCallback();
  }
};

// values the card cannot compact truncate from the end instead of overflowing
const longValueSeries = (value: RowValue, col: DatasetColumn): Series =>
  // Unjustified type cast. FIXME
  [
    {
      card: createMockCard({ name: "Metabase token", display: "scalar" }),
      data: { cols: [col], rows: [[value]] },
    },
  ] as Series;

const LONG_VALUE_SERIES = [
  longValueSeries(
    "0d79f0c276571a3c7fd2b5b6db30c1a9",
    StringColumn({ name: "Token" }),
  ),
  longValueSeries(
    "2025-04-22T22:18:00",
    DateTimeColumn({ name: "Oldest open PR", unit: "minute" }),
  ),
  longValueSeries(Number.MAX_SAFE_INTEGER, NumberColumn({ name: "Count" })),
];

const LONG_VALUE_CARD_SIZES = [
  { width: 345, height: 170 },
  { width: 521, height: 288 },
];

export const LongValues = () => (
  <VisualizationWrapper>
    <Flex gap="lg" wrap="wrap" align="flex-start" p="lg">
      {LONG_VALUE_CARD_SIZES.flatMap(({ width, height }) =>
        LONG_VALUE_SERIES.map((rawSeries, index) => (
          <Box
            key={`${width}x${height}-${index}`}
            w={width}
            h={height}
            style={{
              borderRadius: 12,
              border: "1px solid var(--mb-color-border-neutral)",
            }}
          >
            <Visualization rawSeries={rawSeries} showTitle width={width} />
          </Box>
        )),
      )}
    </Flex>
  </VisualizationWrapper>
);
