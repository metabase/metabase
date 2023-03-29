import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";

import TabButton from "../TabButton";
import TabLink from "../TabLink";
import TabRow from "./TabRow";

export default {
  title: "Core/TabRow",
  component: TabRow,
};

const sampleStyle = {
  maxWidth: "800px",
  padding: "10px",
  border: "1px solid #ccc",
};

const Template: ComponentStory<typeof TabRow> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <div style={sampleStyle}>
      <TabRow {...args} value={value} onChange={handleChange}>
        <TabButton value={1}>Tab 1</TabButton>
        <TabButton value={2}>Tab 2</TabButton>
        <TabButton value={3}>Tab 3</TabButton>
        <TabButton value={4}>Tab 4</TabButton>
        <TabButton value={5}>Tab 5</TabButton>
        <TabButton value={6}>Tab 6</TabButton>
        <TabButton value={7}>Tab 7</TabButton>
      </TabRow>
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  value: 1,
};

const LinkTemplate: ComponentStory<typeof TabRow> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <div style={sampleStyle}>
      <TabRow {...args} value={value} onChange={handleChange}>
        <TabLink value={1} to="">
          Tab 1
        </TabLink>
        <TabLink value={2} to="">
          Tab 2
        </TabLink>
        <TabLink value={3} to="">
          Tab 3
        </TabLink>
        <TabLink value={4} to="">
          Tab 4
        </TabLink>
        <TabLink value={5} to="">
          Tab 5
        </TabLink>
        <TabLink value={6} to="">
          Tab 6
        </TabLink>
        <TabLink value={7} to="">
          Tab 7
        </TabLink>
      </TabRow>
    </div>
  );
};

export const WithLinks = LinkTemplate.bind({});
WithLinks.args = {
  value: 1,
};
