import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import Tab from "../Tab";

import TabList from "./TabList";

export default {
  title: "Core/TabList",
  component: TabList,
};

const sampleStyle = {
  maxWidth: "200px",
  padding: "10px",
  border: "1px solid #ccc",
};

const Template: ComponentStory<typeof TabList> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <div style={sampleStyle}>
      <TabList {...args} value={value} onChange={handleChange}>
        <Tab value={1}>Tab 1</Tab>
        <Tab value={2}>Tab 2</Tab>
        <Tab value={3}>Tab3_supercal_ifragilisticexpia_lidocious</Tab>
        <Tab value={4}>
          Tab 4 With a Very Long Name that may cause this component to wrap
        </Tab>
        <Tab value={5}>
          Tab 5 With a Very Long Name that may cause this component to wrap
        </Tab>
        <Tab value={6}>
          Tab 6 With a Very Long Name that may cause this component to wrap
        </Tab>
        <Tab value={7}>
          Tab 7 With a Very Long Name that may cause this component to wrap
        </Tab>
      </TabList>
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  value: 1,
};
