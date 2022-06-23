import React from "react";
import { ComponentStory } from "@storybook/react";
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
