import type { StoryFn } from "@storybook/react";

import ExternalLink from "./ExternalLink";

export default {
  title: "Core/ExternalLink",
  component: ExternalLink,
};

const Template: StoryFn<typeof ExternalLink> = args => {
  return <ExternalLink {...args} />;
};

export const Default = {
  render: Template,

  args: {
    href: "/",
    children: "Link",
  },
};
