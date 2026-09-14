import type { StoryObj } from "@storybook/react";

import { Box, Text } from "metabase/ui";
import { measureTextWidth } from "metabase/utils/measure-text";

import type { LegendItemData } from "./LegendItem";
import { LegendLayout } from "./LegendLayout";
import { MIN_LEGEND_CARD_HEIGHT, MIN_LEGEND_CARD_WIDTH } from "./layout";

export default {
  title: "viz/Legend/LegendLayout",
  component: LegendLayout,
};

const COLORS = ["#509EE3", "#88BF4D", "#A989C5", "#EF8C8C", "#F9D45C"];

const createItems = (names: string[]): LegendItemData[] =>
  names.map((name, index) => ({
    key: name,
    name,
    color: COLORS[index % COLORS.length],
  }));

const SHORT_NAMES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
const MANY_NAMES = Array.from({ length: 20 }, (_, i) => `Series ${i + 1}`);
const LONG_NAMES = [
  "A very long series name that never fits",
  "Another very long series name that never fits",
  "Yet another very long series name that never fits",
  "Short",
];

interface CardProps {
  names: string[];
  width: number;
  height: number;
  isQueryBuilder?: boolean;
  alwaysVisible?: boolean;
}

// vertical padding of the card wrapper below; real charts measure their
// viewport, so the stories pass the equivalent height for exact row fitting
const CARD_VERTICAL_PADDING = 16;

const Card = ({
  names,
  width,
  height,
  isQueryBuilder,
  alwaysVisible,
}: CardProps) => (
  <Box
    w={width}
    h={height}
    p="0.5rem 1rem"
    bd="1px solid var(--mb-color-border)"
    style={{ borderRadius: "0.75rem", display: "flex" }}
  >
    <LegendLayout
      items={createItems(names)}
      hasLegend
      width={width}
      height={height}
      chartHeight={height - CARD_VERTICAL_PADDING}
      isQueryBuilder={isQueryBuilder}
      alwaysVisible={alwaysVisible}
      fontFamily="Lato"
      measureText={measureTextWidth}
    >
      <Box
        flex="1 1 auto"
        bg="background_page-secondary"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text c="text-secondary">chart</Text>
      </Box>
    </LegendLayout>
  </Box>
);

export const Horizontal: StoryObj = {
  render: () => <Card names={SHORT_NAMES} width={600} height={300} />,
};

// the smallest card that still shows a legend (the unit tests cover the
// exact 420x200 boundary)
export const MinimumCardSize: StoryObj = {
  render: () => (
    <Card
      names={SHORT_NAMES}
      width={MIN_LEGEND_CARD_WIDTH}
      height={MIN_LEGEND_CARD_HEIGHT}
    />
  ),
};

export const HiddenOnSmallCard: StoryObj = {
  render: () => <Card names={SHORT_NAMES} width={360} height={180} />,
};

export const Vertical: StoryObj = {
  render: () => (
    <Card names={MANY_NAMES.slice(0, 12)} width={600} height={300} />
  ),
};

export const VerticalOverflow: StoryObj = {
  render: () => <Card names={MANY_NAMES} width={600} height={300} />,
};

export const VerticalTruncated: StoryObj = {
  render: () => (
    <Card
      names={[...LONG_NAMES.slice(0, 2), ...SHORT_NAMES]}
      width={600}
      height={300}
    />
  ),
};

// more than half of the names are truncated, so the legend is dropped
export const HiddenWhenMostlyTruncated: StoryObj = {
  render: () => <Card names={LONG_NAMES} width={600} height={300} />,
};

export const LargeCardHorizontal: StoryObj = {
  render: () => <Card names={SHORT_NAMES} width={700} height={420} />,
};

export const LargeCardVertical: StoryObj = {
  render: () => (
    <Card names={MANY_NAMES.slice(0, 10)} width={700} height={420} />
  ),
};

export const LargeCardVerticalOverflow: StoryObj = {
  render: () => <Card names={MANY_NAMES} width={700} height={420} />,
};

export const VisualizerSmallCanvasAlwaysVisible: StoryObj = {
  render: () => (
    <Card
      names={MANY_NAMES.slice(0, 8)}
      width={360}
      height={220}
      alwaysVisible
    />
  ),
};

export const QueryBuilderHorizontal: StoryObj = {
  render: () => (
    <Card names={SHORT_NAMES} width={1000} height={500} isQueryBuilder />
  ),
};

export const QueryBuilderVertical: StoryObj = {
  render: () => (
    <Card names={MANY_NAMES} width={571} height={600} isQueryBuilder />
  ),
};
