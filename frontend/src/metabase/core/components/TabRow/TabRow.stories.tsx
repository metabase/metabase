import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";
import { useState } from "react";

import { color } from "metabase/lib/colors";

import { Sortable } from "../Sortable";
import type { TabButtonMenuItem, TabButtonMenuAction } from "../TabButton";
import { TabButton } from "../TabButton";
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

  const action: TabButtonMenuAction = ({ value: selectedValue }, value) =>
    setMessage(
      `Clicked ${value}, currently selected value is ${selectedValue}`,
    );

  const menuItems: TabButtonMenuItem[] = [
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
        {[1, 2, 3, 4, 5, 6, 7].map(num => (
          <TabLink value={num} to="" key={num}>
            Tab {num}
          </TabLink>
        ))}
      </TabRow>
    </div>
  );
};

export const WithLinks = LinkTemplate.bind({});
WithLinks.args = {
  value: 1,
};

const DraggableTemplate: ComponentStory<typeof TabRow> = args => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  const [ids, setIds] = useState<UniqueIdentifier[]>(["1", "2", "3", "4", "5"]);

  return (
    <div style={sampleStyle}>
      <TabRow
        {...args}
        value={value}
        onChange={handleChange}
        itemIds={ids}
        handleDragEnd={(activeId, overId) =>
          setIds(arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId)))
        }
      >
        {ids.map(num => (
          <Sortable id={num} key={num}>
            <TabButton value={num} label={`Tab ${num}`} />
          </Sortable>
        ))}
      </TabRow>
      <span>
        Drag and drop to reorder the tabs, powered by{" "}
        <a
          href="https://docs.dndkit.com/presets/sortable"
          target="_blank"
          rel="noreferrer"
          style={{ color: color("brand") }}
        >
          dnd-kit.
        </a>
      </span>
    </div>
  );
};

export const Draggable = DraggableTemplate.bind({});
Draggable.args = {
  value: 1,
};
