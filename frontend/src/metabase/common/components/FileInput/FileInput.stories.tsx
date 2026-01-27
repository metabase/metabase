import type { StoryFn } from "@storybook/react";

import { FileInput } from "./FileInput";

export default {
  title: "Components/Ask Before Using/FileInput",
  component: FileInput,
};

const Template: StoryFn<typeof FileInput> = (args) => {
  return <FileInput {...args} />;
};

export const Default = {
  render: Template,

  args: {
    name: "file",
  },
};
