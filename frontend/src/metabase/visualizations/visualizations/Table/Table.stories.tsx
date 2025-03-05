import type { StoryFn } from "@storybook/react";

import { VisualizationWrapper } from "__support__/storybook";
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

const DefaultTemplate: StoryFn<{ series: RawSeries }> = ({
  series,
}: {
  series: RawSeries;
}) => (
  <VisualizationWrapper>
    <Box h="calc(100vh - 2rem)">
      <Visualization rawSeries={series} />,
    </Box>
  </VisualizationWrapper>
);

export const DefaultTable = {
  render: DefaultTemplate,
  args: {
    series: data.variousColumnSettings,
  },
};
