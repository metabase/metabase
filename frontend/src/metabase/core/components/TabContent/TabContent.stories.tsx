import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import Tab from "../Tab";
import TabList from "../TabList";
import TabPanel from "../TabPanel";

import TabContent from "./TabContent";

export default {
  title: "Core/TabContent",
  component: TabContent,
};
const Template: ComponentStory<typeof TabContent> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <TabContent {...args} value={value} onChange={handleChange}>
      <TabList>
        <Tab value={1}>Tab 1</Tab>
        <Tab value={2}>Tab 2</Tab>
      </TabList>
      <TabPanel value={1}>Panel 1</TabPanel>
      <TabPanel value={2}>Panel 2</TabPanel>
    </TabContent>
  );
};

export const Default = Template.bind({});
Default.args = {
  value: 1,
};
