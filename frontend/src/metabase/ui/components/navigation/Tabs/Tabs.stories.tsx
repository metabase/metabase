import { useState } from "react";

import { Icon, Tabs, type TabsProps } from "metabase/ui";
import type { IconName } from "metabase-types/api";

const args = {
  orientation: "horizontal",
  listBorder: true,
};

const argTypes = {
  orientation: {
    options: ["horizontal", "vertical"],
    control: { type: "inline-radio" },
  },
  variant: {
    options: ["default", "pills"],
    control: { type: "inline-radio" },
  },
  listBorder: {
    control: { type: "boolean" },
  },
};

const tabs = [
  { value: "overview", label: "Overview", icon: "home" },
  { value: "metrics", label: "Metrics", icon: "metric" },
  { value: "segments", label: "Segments", icon: "segment" },
  { value: "actions", label: "Actions", icon: "bolt", disabled: true },
  { value: "filters", label: "Filters", icon: "filter" },
] satisfies {
  value: string;
  label: string;
  icon: IconName;
  disabled?: boolean;
}[];

const DefaultTemplate = (args: TabsProps) => (
  <Tabs {...args}>
    <Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Tab key={tab.value} value={tab.value} disabled={tab.disabled}>
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {tabs.map((tab) => (
      <Tabs.Panel key={tab.value} value={tab.value}>
        {tab.label}
      </Tabs.Panel>
    ))}
  </Tabs>
);

const IconsTemplate = (args: TabsProps) => (
  <Tabs {...args}>
    <Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Tab
          key={tab.value}
          value={tab.value}
          disabled={tab.disabled}
          leftSection={<Icon name={tab.icon} />}
        >
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {tabs.map((tab) => (
      <Tabs.Panel key={tab.value} value={tab.value}>
        {tab.label}
      </Tabs.Panel>
    ))}
  </Tabs>
);

const ClosableTemplate = (args: TabsProps) => {
  const [openTabs, setOpenTabs] = useState(tabs);
  const [selected, setSelected] = useState<string | null>(tabs[0].value);

  const handleClose = (value: string) => {
    const remaining = openTabs.filter((tab) => tab.value !== value);
    setOpenTabs(remaining);
    if (selected === value) {
      setSelected(remaining[0]?.value ?? null);
    }
  };

  return (
    <Tabs {...args} value={selected} onChange={setSelected}>
      <Tabs.List>
        {openTabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            closable
            onClose={handleClose}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {openTabs.map((tab) => (
        <Tabs.Panel key={tab.value} value={tab.value}>
          {tab.label}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
};

export default {
  title: "Components/Navigation/Tabs",
  component: Tabs,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Icons = {
  render: IconsTemplate,
};

export const VerticalOrientation = {
  render: DefaultTemplate,
  name: "Vertical orientation",
  args: {
    orientation: "vertical",
  },
};

export const VerticalOrientationIcons = {
  render: IconsTemplate,
  name: "Vertical orientation, icons",
  args: {
    orientation: "vertical",
  },
};

export const NoListBorder = {
  render: DefaultTemplate,
  name: "Without list border",
  args: {
    listBorder: false,
  },
};

export const Pills = {
  render: DefaultTemplate,
  args: {
    variant: "pills",
  },
};

export const PillsIcons = {
  render: IconsTemplate,
  name: "Pills, icons",
  args: {
    variant: "pills",
  },
};

export const Closable = {
  render: ClosableTemplate,
};

export const ClosablePills = {
  render: ClosableTemplate,
  name: "Closable, pills",
  args: {
    variant: "pills",
  },
};
