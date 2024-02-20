import type { ComponentStory } from "@storybook/react";

import EditableText from "./EditableText";

export default {
  title: "Core/EditableText",
  component: EditableText,
};

const Template: ComponentStory<typeof EditableText> = args => {
  return <EditableText {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  initialValue: "Question",
  placeholder: "Enter title",
};

export const Multiline = Template.bind({});
Multiline.args = {
  initialValue: "Question",
  placeholder: "Enter title",
  isMultiline: true,
};

export const WithMaxWidth = Template.bind({});
WithMaxWidth.args = {
  initialValue: "Question",
  placeholder: "Enter title",
  style: { maxWidth: 500 },
};

export const WithMarkdown = Template.bind({});
WithMarkdown.args = {
  initialValue: `**bold** text

  *multiline*

  and [link](https://metabase.com)`,
  placeholder: "Enter description",
  isMultiline: true,
  isMarkdown: true,
};
