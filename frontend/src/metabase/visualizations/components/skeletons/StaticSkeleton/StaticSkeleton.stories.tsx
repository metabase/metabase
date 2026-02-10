import type { StoryFn } from "@storybook/react-webpack5";

import StaticSkeleton from "./StaticSkeleton";

export default {
  title: "Viz/Static Viz/StaticSkeleton",
  component: StaticSkeleton,
};

const Template: StoryFn<typeof StaticSkeleton> = (args) => {
  return (
    <div style={{ padding: 8, height: 250, backgroundColor: "white" }}>
      <StaticSkeleton {...args} />
    </div>
  );
};

export const Default = {
  render: Template,

  args: {
    name: "Question",
    description: "This is the question’s description",
    icon: { name: "bar" },
  },
};

export const WithDescription = {
  render: Template,
};
