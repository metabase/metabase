import React from "react";
import { ComponentStory } from "@storybook/react";
import SlackHelpCard from "./SlackHelpCard";

export default {
  title: "Admin/Settings/Slack/SlackHelpCard",
  component: SlackHelpCard,
};

const Template: ComponentStory<typeof SlackHelpCard> = args => {
  return <SlackHelpCard {...args} />;
};

export const Default = Template.bind({});
