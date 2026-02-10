import type { StoryFn } from "@storybook/react-webpack5";

import { VisualizationWrapper } from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
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
