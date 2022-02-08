import React from "react";
import { ComponentStory } from "@storybook/react";
import ActionModal from "./ActionModal";

export default {
  title: "Events/ActionModal",
  component: ActionModal,
};

const Template: ComponentStory<typeof ActionModal> = args => {
  return <ActionModal {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  title: "Events",
};
