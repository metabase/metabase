import React from "react";
import type { ComponentStory } from "@storybook/react";
import FileInput from "./FileInput";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/FileInput",
  component: FileInput,
};

const Template: ComponentStory<typeof FileInput> = args => {
  return <FileInput {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  name: "file",
};
