import { fn } from "@storybook/test";

import { Icon, Stack } from "metabase/ui";

import { NumberInput, type NumberInputProps } from "./";

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
  onChange: fn(),
};

const sampleArgs = {
  value: 1234,
  label: "Goal value",
  description: "Constant line added as a marker to the chart",
  placeholder: "0",
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
    control: { type: "number" },
  },
  description: {
    control: { type: "number" },
  },
  placeholder: {
    control: { type: "number" },
  },
  error: {
    control: { type: "number" },
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

const VariantTemplate = (args: NumberInputProps) => (
  <Stack>
    <NumberInput {...args} variant="default" />
    <NumberInput {...args} variant="unstyled" />
  </Stack>
);

const IconTemplate = (args: NumberInputProps) => (
  <VariantTemplate {...args} leftSection={<Icon name="int" />} />
);

export default {
  title: "Components/Inputs/NumberInput",
  component: NumberInput,
  args,
  argTypes,
};

export const Default = {};

export const EmptyMd = {
  render: VariantTemplate,
  name: "Empty, md",
  args: {
    label: sampleArgs.label,
    placeholder: sampleArgs.placeholder,
  },
};

export const FilledMd = {
  render: VariantTemplate,
  name: "Filled, md",
  args: {
    defaultValue: sampleArgs.value,
    label: sampleArgs.label,
    placeholder: sampleArgs.placeholder,
  },
};

export const AsteriskMd = {
  render: VariantTemplate,
  name: "Asterisk, md",
  args: {
    label: sampleArgs.label,
    placeholder: sampleArgs.placeholder,
    withAsterisk: true,
  },
};

export const DescriptionMd = {
  render: VariantTemplate,
  name: "Description, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
  },
};

export const DisabledMd = {
  render: VariantTemplate,
  name: "Disabled, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    disabled: true,
    withAsterisk: true,
  },
};

export const ErrorMd = {
  render: VariantTemplate,
  name: "Error, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    error: sampleArgs.error,
    withAsterisk: true,
  },
};

export const IconMd = {
  render: IconTemplate,
  name: "Icon, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    withAsterisk: true,
  },
};

export const ReadOnlyMd = {
  render: IconTemplate,
  name: "Read only, md",
  args: {
    defaultValue: sampleArgs.value,
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    readOnly: true,
  },
};

export const EmptyXs = {
  render: VariantTemplate,
  name: "Empty, xs",
  args: {
    ...EmptyMd.args,
    size: "xs",
  },
};

export const FilledXs = {
  render: VariantTemplate,
  name: "Filled, xs",
  args: {
    ...FilledMd.args,
    size: "xs",
  },
};

export const AsteriskXs = {
  render: VariantTemplate,
  name: "Asterisk, xs",
  args: {
    ...AsteriskMd.args,
    size: "xs",
  },
};

export const DescriptionXs = {
  render: VariantTemplate,
  name: "Description, xs",
  args: {
    ...DescriptionMd.args,
    size: "xs",
  },
};

export const DisabledXs = {
  render: VariantTemplate,
  name: "Disabled, xs",
  args: {
    ...DisabledMd.args,
    size: "xs",
  },
};

export const ErrorXs = {
  render: VariantTemplate,
  name: "Error, xs",
  args: {
    ...ErrorMd.args,
    size: "xs",
  },
};

export const IconXs = {
  render: IconTemplate,
  name: "Icon, xs",
  args: {
    ...IconMd.args,
    size: "xs",
  },
};

export const ReadOnlyXs = {
  render: VariantTemplate,
  name: "Read only, xs",
  args: {
    ...ReadOnlyMd.args,
    size: "xs",
  },
};
