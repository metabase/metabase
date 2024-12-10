import { Icon, Tabs, type TabsProps } from "metabase/ui";

const args = {
  orientation: "horizontal",
};

const argTypes = {
  orientation: {
    options: ["horizontal", "vertical"],
    control: { type: "inline-radio" },
  },
};

const tabs = [
  { value: "overview", label: "Overview", icon: "home" },
  { value: "metrics", label: "Metrics", icon: "metric" },
  { value: "segments", label: "Segments", icon: "segment" },
  { value: "actions", label: "Actions", icon: "bolt", disabled: true },
  { value: "filters", label: "Filters", icon: "filter" },
];

const DefaultTemplate = (args: TabsProps) => (
  <Tabs {...args}>
    <Tabs.List>
      {tabs.map(tab => (
        <Tabs.Tab key={tab.value} value={tab.value} disabled={tab.disabled}>
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {tabs.map(tab => (
      <Tabs.Panel key={tab.value} value={tab.value}>
        {tab.label}
      </Tabs.Panel>
    ))}
  </Tabs>
);

const IconsTemplate = (args: TabsProps) => (
  <Tabs {...args}>
    <Tabs.List>
      {tabs.map(tab => (
        <Tabs.Tab
          key={tab.value}
          value={tab.value}
          disabled={tab.disabled}
          leftSection={<Icon name={tab.icon as keyof typeof Icon} />}
        >
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {tabs.map(tab => (
      <Tabs.Panel key={tab.value} value={tab.value}>
        {tab.label}
      </Tabs.Panel>
    ))}
  </Tabs>
);

export default {
  title: "Navigation/Tabs",
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
