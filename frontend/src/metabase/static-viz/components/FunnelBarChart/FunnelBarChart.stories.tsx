import type { ComponentStory } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";

import { data } from "./stories-data";

export default {
  title: "static-viz/FunnelBarChart",
  component: IsomorphicVisualizationStory,
};

const Template: ComponentStory<typeof IsomorphicVisualizationStory> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.funnelBarCategorical,
};
