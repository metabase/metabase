import { MultiAutocomplete, Stack } from "metabase/ui";

const args = {
  data: [],
  size: "md",
  label: "Field type",
  description: undefined,
  error: undefined,
  placeholder: "No semantic type",
  disabled: false,
  readOnly: false,
  withAsterisk: false,
  dropdownPosition: "flip",
};

const sampleArgs = {
  data: ["Doohickey", "Gadget", "Gizmo", "Widget"],
  value: ["Gadget"],
  description: "Determines how Metabase displays the field",
  error: "required",
};

const argTypes = {
  data: {
    control: { type: "json" },
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
  error: {
    control: { type: "text" },
  },
  placeholder: {
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
  dropdownPosition: {
    options: ["bottom", "top", "flip"],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = args => (
  <MultiAutocomplete {...args} shouldCreate={query => query.length > 0} />
);

const VariantTemplate = args => (
  <Stack>
    <DefaultTemplate {...args} />
    <DefaultTemplate {...args} variant="unstyled" />
  </Stack>
);

const Default = DefaultTemplate.bind({});
const EmptyMd = VariantTemplate.bind({});
const AsteriskMd = VariantTemplate.bind({});
const ClearableMd = VariantTemplate.bind({});
const DescriptionMd = VariantTemplate.bind({});
const DisabledMd = VariantTemplate.bind({});
const ErrorMd = VariantTemplate.bind({});
const ReadOnlyMd = VariantTemplate.bind({});
const EmptyXs = VariantTemplate.bind({});
const AsteriskXs = VariantTemplate.bind({});
const ClearableXs = VariantTemplate.bind({});
const DescriptionXs = VariantTemplate.bind({});
const DisabledXs = VariantTemplate.bind({});
const ErrorXs = VariantTemplate.bind({});
const ReadOnlyXs = VariantTemplate.bind({});

export default {
  title: "Inputs/MultiAutocomplete",
  component: MultiAutocomplete,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
  args: {
    data: sampleArgs.data,
  },
};

export const EmptyMd_ = {
  render: EmptyMd,
  name: "Empty, md",
};

export const AsteriskMd_ = {
  render: AsteriskMd,
  name: "Asterisk, md",
  args: {
    withAsterisk: true,
  },
};

export const ClearableMd_ = {
  render: ClearableMd,
  name: "Clearable, md",
  args: {
    data: sampleArgs.data,
    defaultValue: sampleArgs.value,
    clearable: true,
    withAsterisk: true,
  },
};

export const DescriptionMd_ = {
  render: DescriptionMd,
  name: "Description, md",
  args: {
    data: sampleArgs.data,
    description: sampleArgs.description,
    withAsterisk: true,
  },
};

export const DisabledMd_ = {
  render: DisabledMd,
  name: "Disabled, md",
  args: {
    data: sampleArgs.data,
    description: sampleArgs.description,
    disabled: true,
    withAsterisk: true,
  },
};

export const ErrorMd_ = {
  render: ErrorMd,
  name: "Error, md",
  args: {
    data: sampleArgs.data,
    description: sampleArgs.description,
    error: sampleArgs.error,
    withAsterisk: true,
  },
};

export const ReadOnlyMd_ = {
  render: ReadOnlyMd,
  name: "Read only, md",
  args: {
    data: sampleArgs.data,
    defaultValue: sampleArgs.value,
    description: sampleArgs.description,
    readOnly: true,
    withAsterisk: true,
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

export const AsteriskXs_ = {
  render: AsteriskXs,
  name: "Asterisk, xs",
  args: {
    ...AsteriskMd.args,
    size: "xs",
  },
};

export const ClearableXs_ = {
  render: ClearableXs,
  name: "Clearable, xs",
  args: {
    ...ClearableMd.args,
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
