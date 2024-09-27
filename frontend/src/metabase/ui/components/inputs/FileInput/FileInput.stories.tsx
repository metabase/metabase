import { FileInput, type FileInputProps, Icon, Stack } from "metabase/ui";

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
  label: "SSL Client Certificate (PEM)",
  description: "A certificate to authenticate the instance to the server",
  placeholder: "Select a file",
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
  withAsterisk: {
    control: { type: "boolean" },
  },
};

const VariantTemplate = (args: FileInputProps) => (
  <Stack>
    <FileInput {...args} variant="default" />
    <FileInput {...args} variant="unstyled" />
  </Stack>
);

const IconTemplate = (args: FileInputProps) => (
  <VariantTemplate {...args} leftSection={<Icon name="attachment" />} />
);

export default {
  title: "Inputs/FileInput",
  component: FileInput,
  args,
  argTypes,
};

export const Default = {};

export const EmptyMd = {
  render: VariantTemplate,
  name: "Empty, md",
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
  name: "Left Section, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    withAsterisk: true,
  },
};

export const EmptyXs = {
  render: VariantTemplate,
  name: "Empty, xs",
  args: {
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
  name: "Left Section, xs",
  args: {
    ...IconMd.args,
    size: "xs",
  },
};
