import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Icon, TagsInput, type TagsInputProps, Text } from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

import S from "./TagsInput.module.css";

const sampleArgs = {
  value: ["id", "created_at"],
  data: ["id", "created_at", "updated_at", "user_id", "email"],
  label: "Merge key",
  description: "Type a column name and press comma or enter",
  placeholder: "Placeholder",
  error: "required",
};

const args = {
  size: "md",
  label: sampleArgs.label,
  description: undefined,
  error: undefined,
  placeholder: sampleArgs.placeholder,
  disabled: false,
  readOnly: false,
  clearable: false,
  withAsterisk: false,
};

const argTypes = {
  size: {
    options: ["md", "lg"],
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
  clearable: {
    control: { type: "boolean" },
  },
  withAsterisk: {
    control: { type: "boolean" },
  },
};

export default {
  title: "Components/Inputs/TagsInput",
  component: TagsInput,
  args,
  argTypes,
};

export const Default = {};

const OVERVIEW_SIZES = ["md", "lg"] as const;

type OverviewRow = {
  id: string;
  label: string;
  props: Partial<TagsInputProps>;
  focus?: boolean;
};

const OVERVIEW_STATES = [
  { id: "default-empty", label: "Default, empty", props: {} },
  {
    id: "default-filled",
    label: "Default, filled",
    props: { defaultValue: sampleArgs.value },
  },
  { id: "focused-empty", label: "Focused, empty", props: {}, focus: true },
  {
    id: "focused-filled",
    label: "Focused, filled",
    props: { defaultValue: sampleArgs.value },
    focus: true,
  },
  {
    id: "error-empty",
    label: "Error, empty",
    props: { error: sampleArgs.error },
  },
  {
    id: "error-filled",
    label: "Error, filled",
    props: { error: sampleArgs.error, defaultValue: sampleArgs.value },
  },
  {
    id: "error-focused-empty",
    label: "Error + Focused, empty",
    props: { error: sampleArgs.error },
    focus: true,
  },
  {
    id: "error-focused-filled",
    label: "Error + Focused, filled",
    props: { error: sampleArgs.error, defaultValue: sampleArgs.value },
    focus: true,
  },
  {
    id: "disabled-empty",
    label: "Disabled, empty",
    props: { disabled: true },
  },
  {
    id: "disabled-filled",
    label: "Disabled, filled",
    props: { disabled: true, defaultValue: sampleArgs.value },
  },
  {
    id: "read-only",
    label: "Read only",
    props: { readOnly: true, defaultValue: sampleArgs.value },
  },
  {
    id: "clearable",
    label: "With clear button",
    props: { clearable: true, defaultValue: sampleArgs.value },
  },
  {
    id: "wrapping",
    label: "Wrapping onto a second line",
    props: { defaultValue: sampleArgs.data },
  },
] satisfies OverviewRow[];

const OVERVIEW_CONTENT = [
  { id: "label-only", label: "Label only", props: { label: "Label" } },
  {
    id: "description",
    label: "With description",
    props: { label: "Label", description: "Input description" },
  },
  {
    id: "left-icon",
    label: "With left icon",
    props: {
      label: "Label",
      leftSection: <Icon name="label" />,
      defaultValue: sampleArgs.value,
    },
  },
] satisfies OverviewRow[];

const OverviewGrid = ({ rows }: { rows: readonly OverviewRow[] }) => (
  <Box
    style={{
      display: "grid",
      gridTemplateColumns: `14rem repeat(${OVERVIEW_SIZES.length}, max-content)`,
      columnGap: "2rem",
      rowGap: "1rem",
      alignItems: "center",
    }}
  >
    <div />
    {OVERVIEW_SIZES.map((size) => (
      <StoryJsx key={size}>{`<TagsInput size="${size}" />`}</StoryJsx>
    ))}
    {rows.map((state) => (
      <Fragment key={state.id}>
        <Text size="sm" c="text-secondary">
          {state.label}
        </Text>
        {OVERVIEW_SIZES.map((size) => (
          <Box key={size} w={256}>
            <TagsInput
              wrapperProps={{ "data-state-row": state.id }}
              placeholder={sampleArgs.placeholder}
              size={size}
              {...state.props}
            />
          </Box>
        ))}
      </Fragment>
    ))}
  </Box>
);

const OverviewTemplate: StoryFn<TagsInputProps> = () => (
  <StoryShowcase title="TagsInput">
    <StorySection
      title="States"
      description="Default size is md. Pills are the standard Pill component."
    >
      <OverviewGrid rows={OVERVIEW_STATES} />
    </StorySection>
    <StorySection title="Content">
      <OverviewGrid rows={OVERVIEW_CONTENT} />
    </StorySection>
  </StoryShowcase>
);

const focusSelector = (id: string) => `[data-state-row="${id}"] .${S.input}`;

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      focusWithin: OVERVIEW_STATES.filter((state) => state.focus).map((state) =>
        focusSelector(state.id),
      ),
    },
    controls: { include: ["theme"] },
  },
};

export const WithSuggestions = {
  name: "With suggestions",
  args: {
    data: sampleArgs.data,
    description: sampleArgs.description,
  },
};
