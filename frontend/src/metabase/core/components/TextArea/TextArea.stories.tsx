import React from "react";
import type { ComponentStory } from "@storybook/react";
import TextArea from "./TextArea";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  title: "Core/Text Area",
  component: TextArea,
};

const Template: ComponentStory<typeof TextArea> = args => {
  return <TextArea {...args} />;
};

export const Default = Template.bind({});
