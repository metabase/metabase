import type { StoryFn } from "@storybook/react";

import { Markdown, type MarkdownProps } from "./Markdown";
import { KITCHEN_SINK_MARKDOWN } from "./kitchen-sink-markdown";

export default {
  title: "Components/Ask Before Using/Markdown",
  component: Markdown,
};

const Template: StoryFn<MarkdownProps> = (args) => {
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

export const KitchenSink = {
  render: Template,

  args: {
    children: KITCHEN_SINK_MARKDOWN,
  },
};

export const KitchenSinkCompact = {
  render: Template,

  args: {
    children: KITCHEN_SINK_MARKDOWN,
    compact: true,
  },
};

export const KitchenSinkWithoutHeadings = {
  render: Template,

  args: {
    children: KITCHEN_SINK_MARKDOWN,
    disallowHeading: true,
  },
};
