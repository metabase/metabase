import { Icon, Tabs } from "metabase/ui";

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

const DefaultTemplate = args => (
  <Tabs {...args}>
    <Tabs.List>
      {tabs.map(tab => (
        <Tabs.Tab key={tab.value} value={tab.value} disabled={tab.disabled}>
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {tabs.map(tab => (
      <Tabs.Panel key={tab.value} value={tab.value} />
    ))}
  </Tabs>
);

const IconsTemplate = args => (
  <Tabs {...args}>
    <Tabs.List>
      {tabs.map(tab => (
        <Tabs.Tab
          key={tab.value}
          value={tab.value}
          disabled={tab.disabled}
          icon={<Icon name={tab.icon} />}
        >
          {tab.label}
        </Tabs.Tab>
      ))}
    </Tabs.List>
    {tabs.map(tab => (
      <Tabs.Panel key={tab.value} value={tab.value} />
    ))}
  </Tabs>
);

const Default = DefaultTemplate.bind({});
const Icons = IconsTemplate.bind({});
const Vertical = DefaultTemplate.bind({});
const VerticalIcons = IconsTemplate.bind({});

export default {
  title: "Navigation/Tabs",
  component: Tabs,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const Icons_ = {
  render: Icons,
  name: "Icons",
};

export const VerticalOrientation = {
  render: Vertical,
  name: "Vertical orientation",
  args: {
    orientation: "vertical",
  },
};

export const VerticalOrientationIcons = {
  render: VerticalIcons,
  name: "Vertical orientation, icons",
  args: {
    orientation: "vertical",
  },
};
