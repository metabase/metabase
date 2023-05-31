import type { ComponentStory } from "@storybook/react";

import Link from "./";

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
