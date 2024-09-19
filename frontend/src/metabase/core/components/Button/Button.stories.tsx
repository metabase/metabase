import type { StoryFn } from "@storybook/react";

import Button from "./Button";

export default {
  title: "Core/Button",
  component: Button,
};

const Template: StoryFn<typeof Button> = args => {
  return <Button {...args} />;
};

export const Default = {
  render: Template,

  args: {
    children: "Default",
  },
};

export const Primary = {
  render: Template,

  args: {
    primary: true,
    children: "Primary",
  },
};

export const WithIcon = {
  render: Template,

  args: {
    icon: "chevrondown",
  },
};

export const OnlyText = {
  render: Template,

  args: {
    onlyText: true,
    children: "Click Me",
  },
};
