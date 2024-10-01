import { Stack, Switch, type SwitchProps } from "metabase/ui";

const args = {
  labelPosition: "right",
  label: "Eat all the cheese",
  description: undefined,
  size: "md",
  disabled: false,
};

const argTypes = {
  labelPosition: {
    control: { type: "inline-radio" },
    options: ["left", "right"],
  },
  variant: {
    control: { type: "inline-radio" },
    options: ["default", "stretch"],
  },
  label: {
    control: { type: "text" },
  },
  description: {
    control: { type: "text" },
  },
  size: {
    control: { type: "inline-radio" },
    options: ["xs", "sm", "md"],
  },
  disabled: {
    control: { type: "boolean" },
  },
};

const StateTemplate = (args: SwitchProps) => (
  <Stack>
    <Switch {...args} label="Unchecked switch" checked={false} />
    <Switch {...args} label="Checked switch" checked />
    <Switch {...args} label="Disabled unchecked switch" disabled />
    <Switch {...args} label="Disabled checked switch" disabled checked />
  </Stack>
);

export default {
  title: "Inputs/Switch",
  component: Switch,
  args,
  argTypes,
};

export const Default = {
  name: "Default",
};

export const Label = {
  render: StateTemplate,
  name: "Label",
};

export const LabelLeftPosition = {
  render: StateTemplate,
  name: "Label, left position",
  args: { labelPosition: "left" },
};

export const Description = {
  render: StateTemplate,
  name: "Description",
  args: {
    description: "Every type of cheese will be consumed, regardless of stink.",
  },
};

export const DescriptionLeftPosition = {
  render: StateTemplate,
  name: "Description, left position",
  args: {
    labelPosition: "left",
    description: "Every type of cheese will be consumed, regardless of stink.",
  },
};
