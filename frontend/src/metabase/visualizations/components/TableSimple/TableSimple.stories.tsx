import type { Story } from "@storybook/react";

import {
  VisualizationWrapper,
  SdkVisualizationWrapper,
} from "__support__/storybook";
import type { MetabaseTheme } from "embedding-sdk";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import Table from "metabase/visualizations/visualizations/Table";

import { TableSimple } from "./TableSimple";
import RAW_SERIES from "./stories-data/table-simple-orders-with-people.json";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);

export default {
  title: "visualizations/TableSimple",
  component: TableSimple,
};

export const Default: Story = () => (
  <VisualizationWrapper>
    <Box h={500}>
      <Visualization rawSeries={RAW_SERIES} />,
    </Box>
  </VisualizationWrapper>
);

export const EmbeddingTheme: Story = () => {
  const theme: MetabaseTheme = {
    components: {
      dashboard: {
        card: { backgroundColor: "#2d2d30" },
      },
      table: {
        cell: { backgroundColor: "#2f3640" },
      },
    },
  };

  return (
    <SdkVisualizationWrapper theme={theme}>
      <Box h={500}>
        <Visualization rawSeries={RAW_SERIES} />,
      </Box>
    </SdkVisualizationWrapper>
  );
};
