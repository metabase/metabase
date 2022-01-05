import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackAppSettings from "./SlackAppSettings";

export default {
  title: "Admin/Settings/Slack/SlackAppSettings",
  component: SlackAppSettings,
};

const Template: ComponentStory<typeof SlackAppSettings> = () => {
  return <SlackAppSettings />;
};

export const Default = Template.bind({});
Default.args = {};
