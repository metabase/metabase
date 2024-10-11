import type { StoryFn } from "@storybook/react";

import Link, { type LinkProps } from "./";

export default {
  title: "Core/Link",
  component: Link,
};

const sampleStyle = {
  padding: "10px",
  display: "flex",
  gap: "2rem",
};

const Template: StoryFn<LinkProps> = args => {
  return (
    <div style={sampleStyle}>
      <Link {...args}>Click Me</Link>
    </div>
  );
};

export const Default = {
  render: Template,

  args: {
    to: "/foo/bar",
    variant: "default",
  },
};
