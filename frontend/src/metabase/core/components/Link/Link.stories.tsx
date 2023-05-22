import React from "react";
import type { ComponentStory } from "@storybook/react";

import Link from "./";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/Link",
  component: Link,
};

const sampleStyle = {
  padding: "10px",
  display: "flex",
  gap: "2rem",
};

const Template: ComponentStory<typeof Link> = args => {
  return (
    <div style={sampleStyle}>
      <Link {...args}>Click Me</Link>
    </div>
  );
};

export const Default = Template.bind({});

Default.args = {
  to: "/foo/bar",
  variant: "default",
};
