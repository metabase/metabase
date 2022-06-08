import React from "react";
import { ComponentStory } from "@storybook/react";
import ChartSkeleton from "./ChartSkeleton";

export default {
  title: "Visualizations/ChartSkeleton",
  component: ChartSkeleton,
};

const Template: ComponentStory<typeof ChartSkeleton> = args => {
  return (
    <div style={{ height: 250 }}>
      <ChartSkeleton {...args} />
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  display: "line",
};

export const Row = Template.bind({});
Row.args = {
  display: "row",
};

export const Table = Template.bind({});
Table.args = {
  display: "table",
};
