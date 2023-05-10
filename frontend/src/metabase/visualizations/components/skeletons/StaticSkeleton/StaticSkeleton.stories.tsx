import React from "react";
import type { ComponentStory } from "@storybook/react";
import StaticSkeleton from "./StaticSkeleton";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Visualizations/StaticSkeleton",
  component: StaticSkeleton,
};

const Template: ComponentStory<typeof StaticSkeleton> = args => {
  return (
    <div style={{ padding: 8, height: 250, backgroundColor: "white" }}>
      <StaticSkeleton {...args} />
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  name: "Question",
  icon: { name: "bar" },
};

export const WithDescription = Template.bind({});
Default.args = {
  name: "Question",
  description: "This is the question’s description",
  icon: { name: "bar" },
};
