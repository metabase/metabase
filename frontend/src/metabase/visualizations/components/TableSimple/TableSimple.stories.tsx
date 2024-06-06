import type { Story } from "@storybook/react";

import { VisualizationWrapper } from "__support__/storybook";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import Table from "metabase/visualizations/visualizations/Table";
import { createMockCard } from "metabase-types/api/mocks";

import { TableSimple } from "./TableSimple";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Table);

export default {
  title: "visualizations/TableSimple",
  component: TableSimple,
};

const MOCK_SERIES = [
  {
    card: createMockCard(),
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
];

export const Default: Story = () => (
  <VisualizationWrapper>
    <Box h={500}>
      <Visualization rawSeries={MOCK_SERIES} width={500} isDashboard />
    </Box>
  </VisualizationWrapper>
);
