import type { StoryObj } from "@storybook/react";

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
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { LineChart } from "./LineChart";

export default {
  title: "viz/LineChart",
  component: LineChart,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(LineChart);

const dataset_query = createMockStructuredDatasetQuery({
  query: { "source-table": 1 },
});

const MOCK_SERIES = [
  {
    card: createMockCard({ id: 1, display: "line", dataset_query }),
    data: {
      cols: [
        StringColumn({ name: "Dimension" }),
        NumberColumn({ name: "Count" }),
      ],
      rows: [
        ["foo", 4],
        ["bar", 20],
        ["baz", 12],
      ],
    },
  },
] as Series;

// This story has become flaky on CI, so we're skipping it for now.
export const Default: StoryObj = {
  render: () => (
    <VisualizationWrapper>
      <Box h={500}>
        <Visualization rawSeries={MOCK_SERIES} width={500} />
      </Box>
    </VisualizationWrapper>
  ),

  parameters: {
    loki: { skip: true },
  },
};

// This story has become flaky on CI, so we're skipping it for now.
export const EmbeddingHugeFont: StoryObj = {
  render: () => {
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
  },

  parameters: {
    loki: { skip: true },
  },
};
