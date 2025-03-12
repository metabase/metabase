import type { StoryFn } from "@storybook/react";

import {
  SdkVisualizationWrapper,
  VisualizationWrapper,
} from "__support__/storybook";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import Table from "metabase/visualizations/visualizations/Table/Table";
import type { RawSeries } from "metabase-types/api";

import * as data from "./stories-data";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);

export default {
  title: "viz/Table",
};

const DefaultTemplate: StoryFn<{
  series: RawSeries;
  isDashboard?: boolean;
}> = ({
  series,
  isDashboard,
}: {
  series: RawSeries;
  isDashboard?: boolean;
}) => (
  <VisualizationWrapper>
    <Box h="calc(100vh - 2rem)">
      <Visualization rawSeries={series} isDashboard={isDashboard} />,
    </Box>
  </VisualizationWrapper>
);

export const DefaultTable = {
  render: DefaultTemplate,
  args: {
    series: data.variousColumnSettings,
  },
};

export const DashboardTable = {
  render: DefaultTemplate,
  args: {
    series: data.ordersWithPeople,
  },
};

export const DashboardTableEmbeddingTheme: StoryFn = () => {
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
        <Visualization rawSeries={data.ordersWithPeople as any} isDashboard />,
      </Box>
    </SdkVisualizationWrapper>
  );
};
