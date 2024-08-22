import type { Story } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";
import type { MetabaseTheme } from "embedding-sdk";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";

import RAW_SERIES from "./stories-data/table-simple-orders-with-people.json";

export default {
  title: "viz/TableSimple",
};

export const Default: Story = () => (
  <VisualizationWrapper>
    <Box h={500}>
      <Visualization rawSeries={RAW_SERIES} isDashboard />,
    </Box>
  </VisualizationWrapper>
);

export const EmbeddingTheme: Story = () => {
  const theme: MetabaseTheme = {
    colors: {
      brand: "#eccc68",
      "text-primary": "#4c5773",
      "text-secondary": "#696e7b",
      "text-tertiary": "#ffffff",
    },
    components: {
      dashboard: {
        card: { backgroundColor: "#2f3542" },
      },
      table: {
        cell: { textColor: "#dfe4ea", backgroundColor: "#2f3640" },
        idColumn: { textColor: "#fff", backgroundColor: "#eccc6855" },
      },
    },
  };

  return (
    <SdkVisualizationWrapper theme={theme}>
      <Box h={500}>
        <Visualization rawSeries={RAW_SERIES} isDashboard />,
      </Box>
    </SdkVisualizationWrapper>
  );
};
