import React from "react";
import type { ComponentStory } from "@storybook/react";
import ExternalLink from "./ExternalLink";

// eslint-disable-next-line import/no-default-export -- deprecated usage
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
