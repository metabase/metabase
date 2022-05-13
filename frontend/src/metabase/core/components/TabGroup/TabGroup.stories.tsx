import React from "react";
import { ComponentStory } from "@storybook/react";
import Tab from "../Tab";
import TabGroup from "./TabGroup";

export default {
  title: "Core/TabGroup",
  component: TabGroup,
};

const Template: ComponentStory<typeof TabGroup> = args => {
  return (
    <TabGroup {...args}>
      <Tab value={1}>One</Tab>
      <Tab value={2}>Two</Tab>
      <Tab value={3}>Three</Tab>
    </TabGroup>
  );
};

export const Default = Template.bind({});
Default.args = {
  value: 1,
};
