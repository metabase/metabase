import React, { useState } from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";

import {
  TabButton,
  TabButtonMenuItem,
  TabButtonMenuAction,
} from "../TabButton";
import TabLink from "../TabLink";
import { TabRow } from "./TabRow";

export default {
  title: "Core/TabRow",
  component: TabRow,
};

const sampleStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  width: "100%",
  padding: "10px",
  border: "1px solid #ccc",
  backgroundColor: "white",
};

const Template: ComponentStory<typeof TabRow> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });
  const [message, setMessage] = useState("");

  const action: TabButtonMenuAction<unknown> = (
    { value: selectedValue },
    value,
  ) =>
    setMessage(
      `Clicked ${value}, currently selected value is ${selectedValue}`,
    );

  const menuItems: TabButtonMenuItem<unknown>[] = [
    {
      label: "Click me!",
      action,
    },
    { label: "Or me", action },
    { label: "Clear", action: () => setMessage("") },
  ];

  return (
    <div style={sampleStyle}>
      <TabRow {...args} value={value} onChange={handleChange}>
        <TabButton label="Tab 1" value={1} menuItems={menuItems} />
        <TabButton label="Tab 2" value={2} />
        <TabButton.Renameable
          label="Tab 3 (Renameable)"
          value={3}
          menuItems={menuItems}
          onRename={newLabel => setMessage(`Renamed to "${newLabel}"`)}
          renameMenuIndex={2}
          renameMenuLabel="Edit name"
        />
        <TabButton
          label="Tab 4"
          value={4}
          menuItems={menuItems}
          showMenu={false}
        />
        <TabButton label="Tab 5" value={5} menuItems={menuItems} />
        <TabButton label="Tab 6" value={6} disabled />
        <TabButton label="Tab 7" value={7} menuItems={menuItems} disabled />
        <TabButton
          label="Tab 8 with a very long name"
          value={8}
          menuItems={menuItems}
        />
      </TabRow>
      {message}
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
