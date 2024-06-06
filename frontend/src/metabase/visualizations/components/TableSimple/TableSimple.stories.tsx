import type { Story } from "@storybook/react";

import { VisualizationWrapper } from "__support__/storybook";
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
