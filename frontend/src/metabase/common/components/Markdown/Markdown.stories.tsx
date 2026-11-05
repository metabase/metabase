import type { StoryFn } from "@storybook/react";

import { Box } from "metabase/ui";

import { Markdown, type MarkdownProps } from "./Markdown";
import {
  KITCHEN_SINK_MARKDOWN,
  UNBREAKABLE_TABLE_MARKDOWN,
} from "./kitchen-sink-markdown";

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

const DARK_SURFACE_PROPS = {
  bg: "tooltip-background",
  c: "tooltip-text",
  p: "xl",
} as const;

const KitchenSinkTemplate: StoryFn<MarkdownProps> = ({ dark, ...args }) => {
  return (
    <Box {...(dark && DARK_SURFACE_PROPS)}>
      <Markdown dark={dark} {...args} />
    </Box>
  );
};

export const KitchenSink = {
  render: KitchenSinkTemplate,

  args: {
    children: KITCHEN_SINK_MARKDOWN,
    compact: false,
    dark: false,
    disallowHeading: false,
    unstyleLinks: false,
  },

  argTypes: {
    compact: { control: "boolean" },
    dark: { control: "boolean" },
    disallowHeading: { control: "boolean" },
    unstyleLinks: { control: "boolean" },
    lineClamp: { control: "number" },
  },
};

const NarrowTemplate: StoryFn<MarkdownProps> = (args) => {
  return (
    <Box w={320}>
      <Markdown {...args} />
    </Box>
  );
};

export const NarrowContainer = {
  render: NarrowTemplate,

  args: {
    children: UNBREAKABLE_TABLE_MARKDOWN,
  },
};
