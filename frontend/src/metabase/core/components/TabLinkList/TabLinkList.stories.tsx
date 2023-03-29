import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";

import TabLink from "../TabLink/TabLink";
import TabLinkList from "./TabLinkList";

export default {
  title: "Core/TabLinkList",
  component: TabLinkList,
};

const sampleStyle = {
  maxWidth: "800px",
  padding: "10px",
  border: "1px solid #ccc",
};

const Template: ComponentStory<typeof TabLinkList> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <div style={sampleStyle}>
      <TabLinkList {...args} value={value} onChange={handleChange}>
        <TabLink value={1}>Tab 1</TabLink>
        <TabLink value={2}>Tab 2</TabLink>
        <TabLink value={3}>Tab 3</TabLink>
        <TabLink value={4}>Tab 4</TabLink>
        <TabLink value={5}>Tab 5</TabLink>
        <TabLink value={6}>Tab 6</TabLink>
        <TabLink value={7}>Tab 7</TabLink>
      </TabLinkList>
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  value: 1,
};
