import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { StoryFn } from "@storybook/react-webpack5";
import { useState } from "react";
import { useArgs } from "storybook/preview-api";

import { color } from "metabase/lib/colors";

import { Sortable } from "../Sortable";
import type { TabButtonMenuAction, TabButtonMenuItem } from "../TabButton";
import { TabButton } from "../TabButton";

import { TabRow } from "./TabRow";

export default {
  title: "Deprecated/Components/TabRow",
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

const Template: StoryFn<typeof TabRow> = (args) => {
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
          onRename={(newLabel) => setMessage(`Renamed to "${newLabel}"`)}
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

export const Default = {
  render: Template,

  args: {
    value: 1,
  },
};

const DraggableTemplate: StoryFn<typeof TabRow> = (args) => {
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
        {ids.map((num) => (
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

export const Draggable = {
  render: DraggableTemplate,

  args: {
    value: 1,
  },
};
