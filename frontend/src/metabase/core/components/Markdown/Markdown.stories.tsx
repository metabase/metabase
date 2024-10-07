import type { StoryFn } from "@storybook/react";

import Markdown, { type MarkdownProps } from "./Markdown";

export default {
  title: "Core/Markdown",
  component: Markdown,
};

const Template: StoryFn<MarkdownProps> = args => {
  return <Markdown {...args} />;
};

export const Default = {
  render: Template,

  args: {
    children: `
  Our first email blast to the mailing list not directly linked to the release
  of a new version. We wanted to see if this would effect visits to landing pages
  for the features in 0.41.

  Here’s a [doc](https://metabase.test) with the findings.`,
  },
};
