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

type TemplateArgs = { rawSeries: Series; displayTheme?: "light" | "dark" };

const Template: StoryFn<TemplateArgs> = ({ rawSeries, displayTheme }) => {
  return (
    <VisualizationWrapper displayTheme={displayTheme}>
      <Box w={1000} h={600}>
        <Visualization
          rawSeries={rawSeries}
          width={1000}
          handleVisualizationClick={() => {}}
        />
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

export const DarkTheme = {
  render: Template,
  args: {
    rawSeries: data.twoLevel,
    displayTheme: "dark",
  },
};
