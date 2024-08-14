import type { ComponentStory } from "@storybook/react";

import Button from "./Button";

export default {
  title: "Core/Button",
  component: Button,
};

const Template: ComponentStory<typeof Button> = args => {
  return <Button {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  children: "Default",
};

export const Primary = Template.bind({});
Primary.args = {
  primary: true,
  children: "Primary",
};

export const WithIcon = Template.bind({});
WithIcon.args = {
  icon: "chevrondown",
};

export const OnlyText = Template.bind({});
OnlyText.args = {
  onlyText: true,
  children: "Click Me",
};
