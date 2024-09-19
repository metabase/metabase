import { Stack, Switch } from "metabase/ui";

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

const DefaultTemplate = args => <Switch {...args} />;

const StateTemplate = args => (
  <Stack>
    <Switch {...args} label="Unchecked switch" checked={false} />
    <Switch {...args} label="Checked switch" checked />
    <Switch {...args} label="Disabled unchecked switch" disabled />
    <Switch {...args} label="Disabled checked switch" disabled checked />
  </Stack>
);

const Default = DefaultTemplate.bind({});
const Label = StateTemplate.bind({});
const LabelLeft = StateTemplate.bind({});
const Description = StateTemplate.bind({});
const DescriptionLeft = StateTemplate.bind({});

export default {
  title: "Inputs/Switch",
  component: Switch,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const Label_ = {
  render: Label,
  name: "Label",
};

export const LabelLeftPosition = {
  render: LabelLeft,
  name: "Label, left position",
  args: { labelPosition: "left" },
};

export const Description_ = {
  render: Description,
  name: "Description",
  args: {
    description: "Every type of cheese will be consumed, regardless of stink.",
  },
};

export const DescriptionLeftPosition = {
  render: DescriptionLeft,
  name: "Description, left position",
  args: {
    labelPosition: "left",
    description: "Every type of cheese will be consumed, regardless of stink.",
  },
};
