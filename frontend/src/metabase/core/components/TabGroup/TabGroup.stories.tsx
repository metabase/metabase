import React from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import Tab from "../Tab";

import TabGroup from "./TabGroup";

export default {
  title: "Core/TabGroup",
  component: TabGroup,
};
const Template: ComponentStory<typeof TabGroup> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <TabGroup {...args} value={value} onChange={handleChange}>
      <Tab value={1}>One</Tab>
      <Tab value={2} icon="link">
        Two
      </Tab>
    </TabGroup>
  );
};

export const Default = Template.bind({});
Default.args = {
  value: 1,
};
