import type { StoryFn } from "@storybook/react";

import TextArea, { type TextAreaProps } from "./TextArea";

export default {
  title: "Core/Text Area",
  component: TextArea,
};

const Template: StoryFn<TextAreaProps> = args => {
  return <TextArea {...args} />;
};

export const Default = {
  render: Template,
};
