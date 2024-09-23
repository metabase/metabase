import { Radio, Stack } from "metabase/ui";

const args = {
  label: "Label",
  description: "",
  disabled: false,
  labelPosition: "right",
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
};

const DefaultTemplate = args => <Radio {...args} />;

const RadioGroupTemplate = args => (
  <Radio.Group
    defaultValue={"react"}
    label="An array of good frameworks"
    description="But which one to use?"
  >
    <Stack mt="md">
      <Radio value="react" label="React" />
      <Radio value="svelte" label="Svelte" />
      <Radio value="ng" label="Angular" />
      <Radio value="vue" label="Vue" />
    </Stack>
  </Radio.Group>
);

const StateTemplate = args => (
  <Stack>
    <Radio {...args} label="Default radio" />
    <Radio {...args} label="Checked radio" defaultChecked />
    <Radio {...args} label="Disabled radio" disabled />
    <Radio {...args} label="Disabled checked radio" disabled defaultChecked />
  </Stack>
);

const Default = DefaultTemplate.bind({});
const RadioGroup = RadioGroupTemplate.bind({});
const Label = StateTemplate.bind({});
const LabelLeft = StateTemplate.bind({});
const Description = StateTemplate.bind({});
const DescriptionLeft = StateTemplate.bind({});

export default {
  title: "Inputs/Radio",
  component: Radio,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const RadioGroup_ = {
  render: RadioGroup,
  name: "Radio group",
};

export const Label_ = {
  render: Label,
  name: "Label",
};

export const LabelLeftPosition = {
  render: LabelLeft,
  name: "Label, left position",
  args: {
    labelPosition: "left",
  },
};

export const Description_ = {
  render: Description,
  name: "Description",
  args: {
    description: "Description",
  },
};

export const DescriptionLeftPosition = {
  render: DescriptionLeft,
  name: "Description, left position",
  args: {
    description: "Description",
    labelPosition: "left",
  },
};
