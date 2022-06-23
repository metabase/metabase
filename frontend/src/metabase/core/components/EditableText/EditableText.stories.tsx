import React, { ChangeEvent } from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import EditableText from "./EditableText";

export default {
  title: "Core/EditableText",
  component: EditableText,
};

const Template: ComponentStory<typeof EditableText> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    updateArgs({ value: event.target.value });
  };

  return <EditableText {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: "Question",
  placeholder: "Enter title",
};
