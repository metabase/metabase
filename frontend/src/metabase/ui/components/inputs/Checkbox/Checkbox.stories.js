import { Checkbox, Stack } from "metabase/ui";

const args = {
  label: "Label",
  description: undefined,
  disabled: false,
  labelPosition: "right",
  size: "md",
};

const argTypes = {
  label: {
    control: { type: "text" },
  },
  description: {
    control: { type: "text" },
  },
  disabled: {
    control: { type: "boolean" },
  },
  labelPosition: {
    options: ["left", "right"],
    control: { type: "inline-radio" },
  },
  size: {
    options: ["xs", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
  variant: {
    options: ["default", "stacked"],
    control: { type: "inline-radio" },
  },
};

const CheckboxGroupTemplate = args => (
  <Checkbox.Group
    defaultValue={["react"]}
    label="An array of good frameworks"
    description="But which one to use?"
  >
    <Stack mt="md">
      <Checkbox {...args} value="react" label="React" />
      <Checkbox {...args} value="svelte" label="Svelte" />
      <Checkbox {...args} value="ng" label="Angular" />
      <Checkbox {...args} value="vue" label="Vue" />
    </Stack>
  </Checkbox.Group>
);

const StateTemplate = args => (
  <Stack>
    <Checkbox {...args} label="Default checkbox" />
    <Checkbox {...args} label="Indeterminate checkbox" indeterminate />
    <Checkbox
      {...args}
      label="Indeterminate checked checkbox"
      defaultChecked
      indeterminate
    />
    <Checkbox {...args} label="Checked checkbox" defaultChecked />
    <Checkbox {...args} label="Disabled checkbox" disabled />
    <Checkbox
      {...args}
      label="Disabled indeterminate checked checkbox"
      disabled
      defaultChecked
      indeterminate
    />
    <Checkbox
      {...args}
      label="Disabled checked checkbox"
      disabled
      defaultChecked
    />
  </Stack>
);

export default {
  title: "Inputs/Checkbox",
  component: Checkbox,
  args,
  argTypes,
};

export const Default = {
  name: "Default",
};

export const CheckboxGroup = {
  render: CheckboxGroupTemplate,
  name: "Checkbox group",
};

export const Label = {
  render: StateTemplate,
  name: "Label",
};

export const LabelLeftPosition = {
  render: StateTemplate,
  name: "Label, left position",
  args: {
    labelPosition: "left",
  },
};

export const Description = {
  render: StateTemplate,
  name: "Description",
};

export const DescriptionLeftPosition = {
  render: StateTemplate,
  name: "Description, left position",
  args: {
    labelPosition: "left",
  },
};

export const Stacked = {
  render: StateTemplate,
  name: "Stacked",
  args: {
    variant: "stacked",
  },
};
