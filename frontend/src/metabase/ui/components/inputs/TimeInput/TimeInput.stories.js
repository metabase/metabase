import { Stack, TimeInput } from "metabase/ui";

const args = {
  variant: "default",
  size: "md",
  label: "Label",
  description: undefined,
  error: undefined,
  placeholder: "Placeholder",
  disabled: false,
  readOnly: false,
  withAsterisk: false,
  onChange: event => {
    // eslint-disable-next-line no-console
    console.log(event.target.value);
  },
};

const sampleArgs = {
  value: new Date(0, 0, 1, 20, 40),
  label: "Time of day",
  description: "The time you've this page",
  placholder: "HH:MM",
  error: "required",
};

const argTypes = {
  variant: {
    options: ["default", "unstyled"],
    control: { type: "inline-radio" },
  },
  size: {
    options: ["xs", "md"],
    control: { type: "inline-radio" },
  },
  label: {
    control: { type: "text" },
  },
  description: {
    control: { type: "text" },
  },
  placeholder: {
    control: { type: "text" },
  },
  error: {
    control: { type: "text" },
  },
  disabled: {
    control: { type: "boolean" },
  },
  readOnly: {
    control: { type: "boolean" },
  },
  withAsterisk: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = args => <TimeInput {...args} />;

const VariantTemplate = args => (
  <Stack>
    <TimeInput {...args} variant="default" />
    <TimeInput {...args} variant="unstyled" />
  </Stack>
);

const Default = DefaultTemplate.bind({});
const EmptyMd = VariantTemplate.bind({});
const FilledMd = VariantTemplate.bind({});
const AsteriskMd = VariantTemplate.bind({});
const DescriptionMd = VariantTemplate.bind({});
const DisabledMd = VariantTemplate.bind({});
const ErrorMd = VariantTemplate.bind({});
const ReadOnlyMd = VariantTemplate.bind({});
const EmptyXs = VariantTemplate.bind({});
const FilledXs = VariantTemplate.bind({});
const AsteriskXs = VariantTemplate.bind({});
const DescriptionXs = VariantTemplate.bind({});
const DisabledXs = VariantTemplate.bind({});
const ErrorXs = VariantTemplate.bind({});
const ReadOnlyXs = VariantTemplate.bind({});

export default {
  title: "Inputs/TimeInput",
  component: TimeInput,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const EmptyMd_ = {
  render: EmptyMd,
  name: "Empty, md",
  args: {
    label: sampleArgs.label,
    placeholder: sampleArgs.placeholder,
  },
};

export const FilledMd_ = {
  render: FilledMd,
  name: "Filled, md",
  args: {
    defaultValue: sampleArgs.value,
    label: sampleArgs.label,
    placeholder: sampleArgs.placeholder,
  },
};

export const AsteriskMd_ = {
  render: AsteriskMd,
  name: "Asterisk, md",
  args: {
    label: sampleArgs.label,
    placeholder: sampleArgs.placeholder,
    withAsterisk: true,
  },
};

export const DescriptionMd_ = {
  render: DescriptionMd,
  name: "Description, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
  },
};

export const DisabledMd_ = {
  render: DisabledMd,
  name: "Disabled, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    disabled: true,
    withAsterisk: true,
  },
};

export const ErrorMd_ = {
  render: ErrorMd,
  name: "Error, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    error: sampleArgs.error,
    withAsterisk: true,
  },
};

export const ReadOnlyMd_ = {
  render: ReadOnlyMd,
  name: "Read only, md",
  args: {
    defaultValue: sampleArgs.value,
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    readOnly: true,
  },
};

export const EmptyXs_ = {
  render: EmptyXs,
  name: "Empty, xs",
  args: {
    ...EmptyMd.args,
    size: "xs",
  },
};

export const FilledXs_ = {
  render: FilledXs,
  name: "Filled, xs",
  args: {
    ...FilledMd.args,
    size: "xs",
  },
};

export const AsteriskXs_ = {
  render: AsteriskXs,
  name: "Asterisk, xs",
  args: {
    ...AsteriskMd.args,
    size: "xs",
  },
};

export const DescriptionXs_ = {
  render: DescriptionXs,
  name: "Description, xs",
  args: {
    ...DescriptionMd.args,
    size: "xs",
  },
};

export const DisabledXs_ = {
  render: DisabledXs,
  name: "Disabled, xs",
  args: {
    ...DisabledMd.args,
    size: "xs",
  },
};

export const ErrorXs_ = {
  render: ErrorXs,
  name: "Error, xs",
  args: {
    ...ErrorMd.args,
    size: "xs",
  },
};

export const ReadOnlyXs_ = {
  render: ReadOnlyXs,
  name: "Read only, xs",
  args: {
    ...ReadOnlyMd.args,
    size: "xs",
  },
};
