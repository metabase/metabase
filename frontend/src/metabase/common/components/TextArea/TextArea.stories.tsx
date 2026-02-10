import type { StoryFn } from "@storybook/react-webpack5";

import { TextArea, type TextAreaProps } from "./TextArea";

export default {
  title: "Components/Ask Before Using/Text Area",
  component: TextArea,
};

const Template: StoryFn<TextAreaProps> = (args) => {
  return <TextArea {...args} />;
};

export const Default = {
  render: Template,
};
