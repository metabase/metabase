import type { StoryFn } from "@storybook/react";

import TextArea from "./TextArea";

export default {
  title: "Core/Text Area",
  component: TextArea,
};

const Template: StoryFn<typeof TextArea> = args => {
  return <TextArea {...args} />;
};

export const Default = {
  render: Template,
};
