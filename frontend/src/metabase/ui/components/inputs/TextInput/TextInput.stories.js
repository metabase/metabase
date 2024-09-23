import { Icon, Stack, TextInput } from "metabase/ui";

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
};

const sampleArgs = {
  value: "Metabase",
  label: "Company or team name",
  description: "Name used for this instance",
  placeholder: "Department of awesome",
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

const DefaultTemplate = args => <TextInput {...args} />;

const VariantTemplate = args => (
  <Stack>
    <TextInput {...args} variant="default" />
    <TextInput {...args} variant="unstyled" />
  </Stack>
);

const IconTemplate = args => (
  <VariantTemplate {...args} icon={<Icon name="dashboard" />} />
);

const RightSectionTemplate = args => (
  <VariantTemplate {...args} rightSection={<Icon name="chevrondown" />} />
);

const Default = DefaultTemplate.bind({});
const EmptyMd = VariantTemplate.bind({});
const FilledMd = VariantTemplate.bind({});
const AsteriskMd = VariantTemplate.bind({});
const DescriptionMd = VariantTemplate.bind({});
const DisabledMd = VariantTemplate.bind({});
const ErrorMd = VariantTemplate.bind({});
const IconMd = IconTemplate.bind({});
const RightSectionMd = RightSectionTemplate.bind({});
const ReadOnlyMd = RightSectionTemplate.bind({});
const EmptyXs = VariantTemplate.bind({});
const FilledXs = VariantTemplate.bind({});
const AsteriskXs = VariantTemplate.bind({});
const DescriptionXs = VariantTemplate.bind({});
const DisabledXs = VariantTemplate.bind({});
const ErrorXs = VariantTemplate.bind({});
const IconXs = IconTemplate.bind({});
const RightSectionXs = RightSectionTemplate.bind({});
const ReadOnlyXs = RightSectionTemplate.bind({});

export default {
  title: "Inputs/TextInput",
  component: TextInput,
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

export const IconMd_ = {
  render: IconMd,
  name: "Icon, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    withAsterisk: true,
  },
};

export const RightSectionMd_ = {
  render: RightSectionMd,
  name: "Right section, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
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

export const IconXs_ = {
  render: IconXs,
  name: "Icon, xs",
  args: {
    ...IconMd.args,
    size: "xs",
  },
};

export const RightSectionXs_ = {
  render: RightSectionXs,
  name: "Right section, xs",
  args: {
    ...RightSectionMd.args,
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
