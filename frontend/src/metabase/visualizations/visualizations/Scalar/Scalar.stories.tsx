// @ts-expect-error There is no type definition
import createAsyncCallback from "@loki/create-async-callback";
import type { StoryFn } from "@storybook/react/*";
import { expect, userEvent, within } from "@storybook/test";

import { VisualizationWrapper } from "__support__/storybook";
import { NumberColumn } from "__support__/visualizations";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockSegmentFormatting,
} from "metabase-types/api/mocks";

import { Scalar } from "./Scalar";

export default {
  title: "viz/Scalar",
  component: Scalar,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Scalar);

const MOCK_SERIES = [
  {
    card: createMockCard({ name: "Card", display: "scalar" }),
    data: {
      cols: [NumberColumn({ name: "Count" })],
      rows: [[67]],
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

export const WithFormatting = () => {
  return (
    <VisualizationWrapper>
      <Box h={500}>
        <Visualization
          rawSeries={MOCK_SERIES}
          width={500}
          settings={SETTINGS}
        />
      </Box>
    </VisualizationWrapper>
  );
};

export const WithFormattingHover = () => {
  return (
    <VisualizationWrapper>
      <Box h={500}>
        <Visualization
          rawSeries={MOCK_SERIES}
          width={500}
          settings={SETTINGS}
        />
      </Box>
    </VisualizationWrapper>
  );
};

WithFormattingHover.play = async ({
  canvasElement,
}: {
  canvasElement: HTMLCanvasElement;
}) => {
  const asyncCallback = createAsyncCallback();
  const canvas = within(canvasElement.parentElement as HTMLElement);
  const value = await canvas.findByTestId("scalar-value");

  await userEvent.hover(value);
  value.classList.add("pseudo-hover");

  await expect(await canvas.findByRole("tooltip")).toBeInTheDocument();
  expect(value.classList.contains("pseudo-hover")).toBe(true);

  asyncCallback();
};
