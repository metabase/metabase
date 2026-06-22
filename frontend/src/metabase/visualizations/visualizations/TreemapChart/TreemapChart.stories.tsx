import type { StoryFn } from "@storybook/react";

import { VisualizationWrapper } from "__support__/storybook";
import { data } from "metabase/static-viz/components/TreemapChart/stories-data";
import { Box } from "metabase/ui";
import { registerVisualization } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import type { Series } from "metabase-types/api";

import { TreemapChart } from "./TreemapChart";

export default {
  title: "viz/TreemapChart",
  component: TreemapChart,
};

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(TreemapChart);

const Template: StoryFn<{ rawSeries: Series }> = ({ rawSeries }) => {
  return (
    <VisualizationWrapper>
      <Box w={1000} h={600}>
        <Visualization rawSeries={rawSeries} width={1000} />
      </Box>
    </VisualizationWrapper>
  );
};

export const TwoLevel = {
  render: Template,
  args: {
    rawSeries: data.twoLevel,
  },
};

export const OneLevel = {
  render: Template,
  args: {
    rawSeries: data.oneLevel,
  },
};

export const DarkTheme: StoryFn = () => (
  <VisualizationWrapper displayTheme="dark">
    <Box w={1000} h={600}>
      <Visualization rawSeries={data.twoLeve} width={1000} />
    </Box>
  </VisualizationWrapper>
);
