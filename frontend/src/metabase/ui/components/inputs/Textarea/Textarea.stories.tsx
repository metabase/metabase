import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Stack, Text, Textarea, type TextareaProps } from "metabase/ui";
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
  longValue:
    "Metabase is the easy, open-source way for everyone in your company to ask questions and learn from data. Type past the last row to see the textarea grow until it reaches maxRows.",
  label: "Description",
  description: "Shown to everyone who opens this item",
  placeholder: "What is this for?",
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

export default {
  title: "Components/Inputs/Textarea",
  component: Textarea,
  args,
  argTypes,
};

export const Default = {};

const SIZES = ["sm", "md", "lg"] as const;

const STATES: {
  id: string;
  label: string;
  props: TextareaProps;
}[] = [
  { id: "default", label: "Default", props: {} },
  { id: "focus", label: "Focused", props: {} },
  { id: "error", label: "Error", props: { error: sampleArgs.error } },
  {
    id: "error-focus",
    label: "Error (focused)",
    props: { error: sampleArgs.error },
  },
  { id: "disabled", label: "Disabled", props: { disabled: true } },
  { id: "read-only", label: "Read only", props: { readOnly: true } },
];

const LABEL_EXAMPLES: {
  id: string;
  jsx: string;
  props: TextareaProps;
}[] = [
  { id: "label", jsx: '<Textarea label="…" />', props: {} },
  {
    id: "asterisk",
    jsx: "<Textarea withAsterisk />",
    props: { withAsterisk: true },
  },
  {
    id: "description",
    jsx: '<Textarea description="…" />',
    props: { description: sampleArgs.description },
  },
  {
    id: "error",
    jsx: '<Textarea error="…" />',
    props: { error: "Description is too long" },
  },
  {
    id: "disabled",
    jsx: "<Textarea disabled />",
    props: { disabled: true },
  },
];

const ROWS_EXAMPLES: {
  id: string;
  jsx: string;
  props: TextareaProps;
}[] = [
  {
    id: "one-row",
    jsx: "<Textarea minRows={1} />",
    props: { minRows: 1, defaultValue: sampleArgs.value },
  },
  {
    id: "autosize",
    jsx: "<Textarea maxRows={4} />",
    props: { maxRows: 4, defaultValue: sampleArgs.longValue },
  },
  {
    id: "resize",
    jsx: '<Textarea autosize={false} rows={3} resize="vertical" />',
    props: {
      autosize: false,
      rows: 3,
      resize: "vertical",
      defaultValue: sampleArgs.value,
    },
  },
];

const INPUT_WIDTH = "16rem";
const LABEL_WIDTH = "9rem";

const RowLabel = ({ label }: { label: string }) => (
  <Text size="sm" c="text-secondary">
    {label}
  </Text>
);

type OverviewArgs = TextareaProps & { filled?: boolean };

const OverviewTemplate: StoryFn<OverviewArgs> = ({ filled }) => {
  const valueProps = filled ? { defaultValue: sampleArgs.value } : {};

  return (
    <StoryShowcase title="Textarea">
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
            alignItems: "start",
          }}
        >
          <div />
          {SIZES.map((size) => (
            <StoryJsx key={size}>{`<Textarea size="${size}" />`}</StoryJsx>
          ))}
          {STATES.map((state) => (
            <Fragment key={state.id}>
              <RowLabel label={state.label} />
              {SIZES.map((size) => (
                <Textarea
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
            gridTemplateColumns: `repeat(3, max-content)`,
            columnGap: "2.5rem",
            rowGap: "2rem",
            alignItems: "end",
          }}
        >
          {LABEL_EXAMPLES.map(({ id, jsx, props }) => (
            <Stack key={id} gap="lg">
              <StoryJsx>{jsx}</StoryJsx>
              <Textarea
                label={sampleArgs.label}
                placeholder={sampleArgs.placeholder}
                w={INPUT_WIDTH}
                {...props}
              />
            </Stack>
          ))}
        </Box>
      </StorySection>

      <StorySection
        title="Rows"
        description="Textarea autosizes between minRows and maxRows by default."
      >
        <Box
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${ROWS_EXAMPLES.length}, max-content)`,
            columnGap: "2.5rem",
            rowGap: "2rem",
          }}
        >
          {ROWS_EXAMPLES.map(({ id, jsx, props }) => (
            <Stack key={id} gap="lg">
              <StoryJsx>{jsx}</StoryJsx>
              <Textarea w={INPUT_WIDTH} {...props} />
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
      // The base styles focus with `:focus-within`, so the addon needs the
      // matching `focusWithin` key — plain `focus` would never apply.
      focusWithin: [
        'textarea[data-state-row="focus"]',
        'textarea[data-state-row="error-focus"]',
      ],
    },
    controls: { include: ["filled", "theme"] },
  },
};
