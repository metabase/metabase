import type { StoryFn } from "@storybook/react-webpack5";

import { VisualizationWrapper } from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { Funnel } from "./Funnel";

export default {
  title: "viz/Funnel",
  component: Funnel,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Funnel);

const dataset_query = createMockStructuredDatasetQuery({
  query: { "source-table": 1 },
});

const MOCK_SERIES = [
  {
    card: createMockCard({ id: 1, display: "funnel", dataset_query }),
    data: {
      cols: [
        StringColumn({ name: "Dimension" }),
        NumberColumn({ name: "Count" }),
      ],
      rows: [
        ["foo", 50],
        ["foo", 50],
        ["foo", null],
        ["bar", 25],
        ["baz", 1],
        ["baz", 1],
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

export const Watermark: StoryFn = () => (
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
