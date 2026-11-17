import type { StoryFn } from "@storybook/react";

import { createMockSettingsState, createMockState } from "__support__/state";
import { VisualizationWrapper } from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualization } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Series } from "metabase-types/api";
import {
  createMockCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { Funnel } from "./Funnel";

export default {
  title: "viz/Funnel",
  component: Funnel,
};

registerVisualization(Funnel);

const dataset_query = Lib.createTestJsQuery(
  SAMPLE_PROVIDER,
  DEFAULT_TEST_QUERY,
);

// Unjustified type cast. FIXME
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
