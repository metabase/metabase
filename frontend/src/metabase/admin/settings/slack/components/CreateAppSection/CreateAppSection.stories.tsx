import React from "react";
import { ComponentStory } from "@storybook/react";
import CreateAppSection from "./CreateAppSection";

export default {
  title: "Admin/Settings/Slack/CreateAppSection",
  component: CreateAppSection,
};

const Template: ComponentStory<typeof CreateAppSection> = () => {
  return <CreateAppSection />;
};

export const Default = Template.bind({});
Default.args = {};
