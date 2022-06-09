import React from "react";
import { ComponentStory } from "@storybook/react";
import UserAvatar from "./UserAvatar";

export default {
  title: "Components/UserAvatar",
  component: UserAvatar,
};

const Template: ComponentStory<typeof UserAvatar> = args => (
  <UserAvatar {...args} />
);

export const Default = Template.bind({});
Default.args = {
  user: {
    first_name: "John",
    last_name: "Wick",
    email: "john.w@hightable.org",
    common_name: "John Wick",
  },
};

export const SingleName = Template.bind({});
SingleName.args = {
  user: {
    first_name: "John",
    last_name: null,
    email: "john.w@hightable.org",
    common_name: "John",
  },
};

export const OnlyEmail = Template.bind({});
OnlyEmail.args = {
  user: {
    first_name: null,
    last_name: null,
    email: "john.w@hightable.org",
    common_name: "john.w@hightable.org",
  },
};
