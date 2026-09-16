import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import {
  ActionIcon,
  Box,
  Icon,
  Input,
  Loader,
  Stack,
  Text,
  TextInput,
  type TextInputProps,
} from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

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

const VariantTemplate = (args: TextInputProps) => (
  <Stack>
    <TextInput {...args} variant="default" />
    <TextInput {...args} variant="unstyled" />
  </Stack>
);

const IconTemplate = (args: TextInputProps) => (
  <VariantTemplate {...args} leftSection={<Icon name="dashboard" />} />
);

const RightSectionTemplate = (args: TextInputProps) => (
  <VariantTemplate {...args} rightSection={<Icon name="chevrondown" />} />
);

export default {
  title: "Components/Inputs/TextInput",
  component: TextInput,
  args,
  argTypes,
};

export const Default = {};

const SIZES = ["sm", "md", "lg"] as const;

const STATES: {
  id: string;
  label: string;
  props: TextInputProps;
}[] = [
  { id: "default", label: "Default", props: {} },
  {
    id: "empty",
    label: "Empty",
    props: { defaultValue: "" },
  },
  { id: "hover", label: "Hover", props: {} },
  { id: "focus", label: "Focused", props: {} },
  { id: "error", label: "Error", props: { error: sampleArgs.error } },
  {
    id: "error-focus",
    label: "Error (focused)",
    props: { error: sampleArgs.error },
  },
  { id: "disabled", label: "Disabled", props: { disabled: true } },
  {
    id: "empty-disabled",
    label: "Empty, disabled",
    props: { defaultValue: "", disabled: true },
  },
  {
    id: "read-only",
    label: "Read only",
    props: { readOnly: true },
  },
];

const INPUT_WIDTH = "14rem";
const LABEL_WIDTH = "9rem";

const labelSlotRows = (hasDescription: boolean) => ({
  root: { display: "grid", gridTemplateRows: "subgrid", gridRow: "span 4" },
  label: hasDescription
    ? { gridRow: 1, alignSelf: "end" }
    : { gridRow: "1 / 3", alignSelf: "end" },
  description: { gridRow: 2, alignSelf: "end" },
  wrapper: { gridRow: 3 },
  error: { gridRow: 4 },
});

const LABEL_EXAMPLES: {
  id: string;
  jsx: string;
  props: TextInputProps;
  width?: string;
}[] = [
  { id: "label", jsx: '<TextInput label="…" />', props: {} },
  {
    id: "asterisk",
    jsx: "<TextInput withAsterisk />",
    props: { withAsterisk: true },
  },
  {
    id: "description",
    jsx: '<TextInput description="…" />',
    props: { description: sampleArgs.description },
    width: "18rem",
  },
  {
    id: "error",
    jsx: '<TextInput error="…" />',
    props: { error: "That name is already taken" },
  },
];

const SECTION_EXAMPLES: {
  id: string;
  jsx: string;
  props: TextInputProps;
}[] = [
  {
    id: "left-icon",
    jsx: "<TextInput leftSection={<Icon />} />",
    props: { leftSection: <Icon name="search" /> },
  },
  {
    id: "right-icon",
    jsx: "<TextInput rightSection={<Icon />} />",
    props: { rightSection: <Icon name="chevrondown" /> },
  },
  {
    id: "both",
    jsx: "<TextInput leftSection rightSection />",
    props: {
      leftSection: <Icon name="search" />,
      rightSection: <Icon name="chevrondown" />,
    },
  },
  {
    id: "clear",
    jsx: "<TextInput rightSection={<Input.ClearButton />} />",
    props: {
      leftSection: <Icon name="search" />,
      rightSectionPointerEvents: "all",
      rightSection: <Input.ClearButton c="text-secondary" />,
    },
  },
  {
    id: "copy",
    jsx: "<TextInput rightSection={<ActionIcon />} />",
    props: {
      rightSectionPointerEvents: "all",
      rightSection: (
        <ActionIcon variant="subtle" c="text-secondary">
          <Icon name="copy" />
        </ActionIcon>
      ),
    },
  },
  {
    id: "loading",
    jsx: "<TextInput rightSection={<Loader />} />",
    props: { rightSection: <Loader size="xs" /> },
  },
];

const RowLabel = ({ label }: { label: string }) => (
  <Text size="sm" c="text-secondary">
    {label}
  </Text>
);

type OverviewArgs = TextInputProps & { filled?: boolean };

const OverviewTemplate: StoryFn<OverviewArgs> = ({ filled }) => {
  const valueProps = filled ? { defaultValue: sampleArgs.value } : {};

  return (
    <StoryShowcase title="TextInput">
      <StorySection
        title="Sizes and states"
        description="Default size is md. Toggle the `filled` control to switch every cell between placeholder and value."
      >
        <Box
          style={{
            display: "grid",
            gridTemplateColumns: `${LABEL_WIDTH} repeat(${SIZES.length}, max-content)`,
            columnGap: "2.5rem",
            rowGap: "1rem",
            alignItems: "center",
          }}
        >
          <div />
          {SIZES.map((size) => (
            <StoryJsx key={size}>{`<TextInput size="${size}" />`}</StoryJsx>
          ))}
          {STATES.map((state) => (
            <Fragment key={state.id}>
              <RowLabel label={state.label} />
              {SIZES.map((size) => (
                <TextInput
                  key={size}
                  data-state-row={state.id}
                  size={size}
                  placeholder={sampleArgs.placeholder}
                  w={INPUT_WIDTH}
                  {...valueProps}
                  {...state.props}
                />
              ))}
            </Fragment>
          ))}
        </Box>
      </StorySection>

      <StorySection title="Label, description and error">
        <Box
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${LABEL_EXAMPLES.length}, max-content)`,
            gridTemplateRows: "repeat(5, auto)",
            columnGap: "2rem",
            rowGap: 0,
          }}
        >
          {LABEL_EXAMPLES.map(({ id, jsx }) => (
            <Box key={id} mb="md">
              <StoryJsx>{jsx}</StoryJsx>
            </Box>
          ))}
          {LABEL_EXAMPLES.map(({ id, props, width }) => (
            <TextInput
              key={id}
              label={sampleArgs.label}
              placeholder={sampleArgs.placeholder}
              w={width ?? INPUT_WIDTH}
              styles={labelSlotRows(props.description != null)}
              {...props}
            />
          ))}
        </Box>
      </StorySection>

      <StorySection title="Sections">
        <Box
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(3, max-content)`,
            columnGap: "2.5rem",
            rowGap: "2rem",
          }}
        >
          {SECTION_EXAMPLES.map(({ id, jsx, props }) => (
            <Stack key={id} gap="lg">
              <StoryJsx>{jsx}</StoryJsx>
              <TextInput
                placeholder={sampleArgs.placeholder}
                w={INPUT_WIDTH}
                defaultValue={sampleArgs.value}
                {...props}
              />
            </Stack>
          ))}
        </Box>
      </StorySection>
    </StoryShowcase>
  );
};

export const Overview = {
  render: OverviewTemplate,
  args: { filled: false },
  argTypes: { filled: { control: { type: "boolean" } } },
  parameters: {
    pseudo: {
      hover: 'input[data-state-row="hover"]',
      // The base styles focus with `:focus-within`, so the addon needs the
      // matching `focusWithin` key — plain `focus` would never apply.
      focusWithin: [
        'input[data-state-row="focus"]',
        'input[data-state-row="error-focus"]',
      ],
    },
    controls: { include: ["filled", "theme"] },
  },
};

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
  name: "Left section, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    withAsterisk: true,
  },
};

export const RightSectionMd = {
  render: RightSectionTemplate,
  name: "Right section, md",
  args: {
    label: sampleArgs.label,
    description: sampleArgs.description,
    placeholder: sampleArgs.placeholder,
    withAsterisk: true,
  },
};

export const ReadOnlyMd = {
  render: RightSectionTemplate,
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
  name: "Left section, xs",
  args: {
    ...IconMd.args,
    size: "xs",
  },
};

export const RightSectionXs = {
  render: RightSectionTemplate,
  name: "Right section, xs",
  args: {
    ...RightSectionMd.args,
    size: "xs",
  },
};

export const ReadOnlyXs = {
  render: RightSectionTemplate,
  name: "Read only, xs",
  args: {
    ...ReadOnlyMd.args,
    size: "xs",
  },
};
