import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import Tab from "../Tab";

import TabList from "./TabList";

export default {
  title: "Core/TabList",
  component: TabList,
};
const Template: ComponentStory<typeof TabList> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <TabList {...args} value={value} onChange={handleChange}>
      <Tab value={1}>Tab 1</Tab>
      <Tab value={2}>Tab 2</Tab>
    </TabList>
  );
};

export const Default = Template.bind({});
Default.args = {
  value: 1,
};
