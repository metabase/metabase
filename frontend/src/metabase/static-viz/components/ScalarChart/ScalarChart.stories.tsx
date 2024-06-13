import type { ComponentStory } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";
import { registerVisualization } from "metabase/visualizations";
import { Scalar } from "metabase/visualizations/visualizations/Scalar";

import { data } from "./stories-data";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(Scalar);

export default {
  title: "static-viz/ScalarChart",
  component: IsomorphicVisualizationStory,
};

const Template: ComponentStory<typeof IsomorphicVisualizationStory> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.twoScalars,
};
