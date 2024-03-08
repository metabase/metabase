import type { ComponentStory } from "@storybook/react";

import ExternalLink from "./ExternalLink";

export default {
  title: "Core/ExternalLink",
  component: ExternalLink,
};

const Template: ComponentStory<typeof ExternalLink> = args => {
  return <ExternalLink {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  href: "/",
  children: "Link",
};
