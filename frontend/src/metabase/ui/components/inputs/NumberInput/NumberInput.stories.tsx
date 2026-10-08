import type { StoryFn } from "@storybook/react";
import { fn } from "@storybook/test";
import { Fragment } from "react";

import { Box, Group, Icon, Stack, Text } from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

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
    options: ["sm", "md", "lg"],
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

const SIZES = ["sm", "md", "lg"] as const;

const STATES: {
  id: string;
  label: string;
  props: NumberInputProps;
}[] = [
  { id: "default", label: "Default", props: {} },
  { id: "empty", label: "Empty", props: { defaultValue: "" } },
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
  { id: "read-only", label: "Read only", props: { readOnly: true } },
];

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
  props: NumberInputProps;
  width?: string;
}[] = [
  { id: "label", jsx: '<NumberInput label="…" />', props: {} },
  {
    id: "asterisk",
    jsx: "<NumberInput withAsterisk />",
    props: { withAsterisk: true },
  },
  {
    id: "description",
    jsx: '<NumberInput description="…" />',
    props: { description: sampleArgs.description },
    width: "14rem",
  },
  {
    id: "error",
    jsx: '<NumberInput error="…" />',
    props: { error: "Enter a number above 0" },
  },
];

const INPUT_WIDTH = "11rem";
const LABEL_WIDTH = "9rem";

const gridStyle = (columns: number) => ({
  display: "grid",
  gridTemplateColumns: `${LABEL_WIDTH} repeat(${columns}, max-content)`,
  columnGap: "2.5rem",
  rowGap: "1rem",
  alignItems: "center",
});

const RowLabel = ({ children }: { children: string }) => (
  <Text size="sm" c="text-secondary">
    {children}
  </Text>
);

type OverviewArgs = NumberInputProps & {
  filled?: boolean;
  withControls?: boolean;
};

const OverviewTemplate: StoryFn<OverviewArgs> = ({ filled, withControls }) => (
  <StoryShowcase title="NumberInput">
    <StorySection
      title="Sizes and states"
      description="Default size is md. The controls are hidden by default in the app; `withControls` shows them, and a disabled or read-only field drops them either way."
    >
      <Box style={gridStyle(SIZES.length)}>
        <div />
        {SIZES.map((size) => (
          <StoryJsx key={size}>{`<NumberInput size="${size}" />`}</StoryJsx>
        ))}
        {STATES.map((state) => (
          <Fragment key={state.id}>
            <RowLabel>{state.label}</RowLabel>
            {SIZES.map((size) => (
              <NumberInput
                key={size}
                data-state-row={state.id}
                size={size}
                placeholder={sampleArgs.placeholder}
                hideControls={!withControls}
                w={INPUT_WIDTH}
                {...(filled ? { defaultValue: sampleArgs.value } : {})}
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
          <NumberInput
            key={id}
            label={sampleArgs.label}
            placeholder={sampleArgs.placeholder}
            defaultValue={sampleArgs.value}
            w={width ?? INPUT_WIDTH}
            styles={labelSlotRows(props.description != null)}
            {...props}
          />
        ))}
      </Box>
    </StorySection>

    <StorySection title="Sections and controls">
      <Group align="flex-start" gap="xxl" wrap="nowrap">
        <Stack gap="lg">
          <StoryJsx>{"<NumberInput leftSection={…} />"}</StoryJsx>
          <NumberInput
            leftSection={<Icon name="int" />}
            placeholder={sampleArgs.placeholder}
            defaultValue={sampleArgs.value}
            w={INPUT_WIDTH}
          />
        </Stack>
        <Stack gap="lg">
          <StoryJsx>{'<NumberInput rightSection="%" />'}</StoryJsx>
          <NumberInput rightSection="%" defaultValue={50} w={INPUT_WIDTH} />
        </Stack>
        <Stack gap="lg">
          <StoryJsx>{"<NumberInput hideControls={false} />"}</StoryJsx>
          <NumberInput
            hideControls={false}
            defaultValue={sampleArgs.value}
            w={INPUT_WIDTH}
          />
        </Stack>
      </Group>
    </StorySection>
  </StoryShowcase>
);

export const Overview = {
  render: OverviewTemplate,
  args: { filled: true, withControls: true },
  argTypes: {
    filled: { control: { type: "boolean" } },
    withControls: { control: { type: "boolean" } },
  },
  parameters: {
    pseudo: {
      hover: 'input[data-state-row="hover"]',
      focusWithin: [
        'input[data-state-row="focus"]',
        'input[data-state-row="error-focus"]',
      ],
    },
    controls: { include: ["filled", "withControls", "theme"] },
  },
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
