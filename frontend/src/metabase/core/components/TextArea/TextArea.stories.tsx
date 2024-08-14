import type { ComponentStory } from "@storybook/react";

import TextArea from "./TextArea";

export default {
  title: "Core/Text Area",
  component: TextArea,
};

const Template: ComponentStory<typeof TextArea> = args => {
  return <TextArea {...args} />;
};

export const Default = Template.bind({});
