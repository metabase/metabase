import {
  DateTimePicker,
  type DateTimePickerProps,
  Icon,
  Stack,
} from "metabase/ui";

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
  withSeconds: true,
};

const sampleArgs = {
  value: new Date(2023, 9, 8, 23, 43, 34),
  label: "Event date",
  description:
    "The event is visible if the date falls within the chart’s time range",
  placeholder: "Enter date",
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
  withSeconds: {
    control: { type: "boolean" },
  },
};

const VariantTemplate = (args: DateTimePickerProps) => (
  <Stack>
    <DateTimePicker {...args} variant="default" />
    <DateTimePicker {...args} variant="unstyled" />
  </Stack>
);

const IconTemplate = (args: DateTimePickerProps) => (
  <VariantTemplate {...args} leftSection={<Icon name="calendar" />} />
);

export default {
  title: "Components/Inputs/DateTimePicker",
  component: DateTimePicker,
  args,
  argTypes,
};

export const Default = {};

export const EmptyMd = {
  render: VariantTemplate,
  name: "Empty, md",
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
