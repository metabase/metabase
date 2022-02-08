import React from "react";
import { ComponentStory } from "@storybook/react";
import PageModal from "./PageModal";

export default {
  title: "Events/PageModal",
  component: PageModal,
};

const Template: ComponentStory<typeof PageModal> = args => {
  return <PageModal {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  title: "Events",
};
