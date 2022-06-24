import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import EditableText from "./EditableText";

export default {
  title: "Core/EditableText",
  component: EditableText,
};

const Template: ComponentStory<typeof EditableText> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value?: string) => {
    updateArgs({ value });
  };

  return <EditableText {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: "Question",
  placeholder: "Enter title",
};

export const Multiline = Template.bind({});
Multiline.args = {
  value: "Question",
  placeholder: "Enter title",
  isMultiline: true,
};

export const WithMaxWidth = Template.bind({});
WithMaxWidth.args = {
  value: "Question",
  placeholder: "Enter title",
  style: { maxWidth: 500 },
};
