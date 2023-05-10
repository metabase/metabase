import React from "react";
import type { ComponentStory } from "@storybook/react";
import Markdown from "./Markdown";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/Markdown",
  component: Markdown,
};

const Template: ComponentStory<typeof Markdown> = args => {
  return <Markdown {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  children: `
Our first email blast to the mailing list not directly linked to the release
of a new version. We wanted to see if this would effect visits to landing pages
for the features in 0.41.

Here’s a [doc](https://metabase.test) with the findings.`,
};
