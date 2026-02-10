import type { StoryFn } from "@storybook/react-webpack5";

import { Box } from "metabase/ui";

import { MarkdownPreview, type MarkdownPreviewProps } from "./MarkdownPreview";

export default {
  title: "Components/Ask Before Using/MarkdownPreview",
  component: MarkdownPreview,
};

const Template: StoryFn<MarkdownPreviewProps> = (args) => {
  return (
    <Box w="200px">
      <MarkdownPreview {...args} />
    </Box>
  );
};

export const PlainText = {
  render: Template,

  args: {
    children: `Our first email blast to the mailing list not directly linked to the release of a new version. We wanted to see if this would effect visits to landing pages for the features in 0.41.`,
  },
};

export const Markdown = {
  render: Template,

  args: {
    children: `![Metabase logo](https://www.metabase.com/images/logo.svg)

  # New version

  Our first email blast to the mailing list not directly linked to the release
  of a new version. We wanted to see if this would effect visits to landing pages
  for the features in 0.41.

  ----

  Here’s a [doc](https://metabase.test) with the findings.`,
  },
};
