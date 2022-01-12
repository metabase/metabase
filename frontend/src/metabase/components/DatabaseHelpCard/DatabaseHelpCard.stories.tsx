import React from "react";
import { ComponentStory } from "@storybook/react";
import DatabaseHelpCard from "./DatabaseHelpCard";

export default {
  title: "Components/DatabaseHelpCard",
  component: DatabaseHelpCard,
};

const Template: ComponentStory<typeof DatabaseHelpCard> = args => {
  return <DatabaseHelpCard {...args} />;
};

export const Default = Template.bind({});

export const MySQL = Template.bind({});
MySQL.args = {
  engine: "mysql",
};
