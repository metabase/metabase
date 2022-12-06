import React from "react";
import type { ComponentStory } from "@storybook/react";
import NativeCode from "./NativeCode";

export default {
  title: "QueryBuilder/NativeCode",
  component: NativeCode,
};

const Template: ComponentStory<typeof NativeCode> = args => {
  return <NativeCode {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  code: "SELECT * FROM ORDERS",
};
