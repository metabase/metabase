import { Stack, Textarea, type TextareaProps } from "metabase/ui";

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
  autosize: false,
  minRows: undefined,
  maxRows: undefined,
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
  autosize: {
    control: { type: "boolean" },
  },
  minRows: {
    control: { type: "number" },
  },
  maxRows: {
    control: { type: "number" },
  },
};

const VariantTemplate = (args: TextareaProps) => (
  <Stack>
    <Textarea {...args} variant="default" />
    <Textarea {...args} variant="unstyled" />
  </Stack>
);

export default {
  title: "Inputs/Textarea",
  component: Textarea,
  args,
  argTypes,
};

export const Default = {
  render: VariantTemplate,
};

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

export const ReadOnlyMd = {
  render: VariantTemplate,
  name: "Read only, md",
  args: {
    defaultValue: sampleArgs.value,
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    readOnly: true,
  },
};

export const AutosizeMd = {
  render: VariantTemplate,
  name: "Autosize, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    autosize: true,
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

export const ReadOnlyXs = {
  render: VariantTemplate,
  name: "Read only, xs",
  args: {
    ...ReadOnlyMd.args,
    size: "xs",
  },
};

export const AutosizeXs = {
  render: VariantTemplate,
  name: "Autosize, xs",
  args: {
    ...AutosizeMd.args,
    size: "xs",
  },
};
