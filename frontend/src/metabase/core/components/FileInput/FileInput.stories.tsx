import type { ComponentStory } from "@storybook/react";

import FileInput from "./FileInput";

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
