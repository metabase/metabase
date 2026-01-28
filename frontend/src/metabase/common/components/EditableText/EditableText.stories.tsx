import type { StoryFn } from "@storybook/react";

import { EditableText, type EditableTextProps } from "./EditableText";

export default {
  title: "Components/Text/EditableText",
  component: EditableText,
};

const Template: StoryFn<EditableTextProps> = (args) => {
  return <EditableText {...args} />;
};

export const Default = {
  render: Template,

  args: {
    initialValue: "Question",
    placeholder: "Enter title",
  },
};

export const Multiline = {
  render: Template,

  args: {
    initialValue: "Question",
    placeholder: "Enter title",
    isMultiline: true,
  },
};

export const WithMaxWidth = {
  render: Template,

  args: {
    initialValue: "Question",
    placeholder: "Enter title",
    style: { maxWidth: 500 },
  },
};

export const WithMarkdown = {
  render: Template,

  args: {
    initialValue: `**bold** text

    *multiline*

    and [link](https://metabase.com)`,
    placeholder: "Enter description",
    isMultiline: true,
    isMarkdown: true,
  },
};
