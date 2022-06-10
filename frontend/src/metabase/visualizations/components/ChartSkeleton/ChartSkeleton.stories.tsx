import React from "react";
import { ComponentStory } from "@storybook/react";
import ChartSkeleton from "./ChartSkeleton";

export default {
  title: "Visualizations/ChartSkeleton",
  component: ChartSkeleton,
};

const Template: ComponentStory<typeof ChartSkeleton> = args => {
  return (
    <div style={{ height: 182 }}>
      <ChartSkeleton {...args} />
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  display: "line",
  displayName: "Question",
};
