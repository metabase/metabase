import React from "react";
import { ComponentStory } from "@storybook/react";
import EventModal from "./EventModal";

export default {
  title: "Events/EventModal",
  component: EventModal,
};

const Template: ComponentStory<typeof EventModal> = args => {
  return <EventModal {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  title: "Events",
};
