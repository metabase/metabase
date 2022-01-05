import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackSection from "./SlackSection";

export default {
  title: "Admin/Settings/Slack/SlackSection",
  component: SlackSection,
};

const Template: ComponentStory<typeof SlackSection> = args => {
  return <SlackSection {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  title: "1. Create your Slack app",
};
