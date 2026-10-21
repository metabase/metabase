import type { StoryFn } from "@storybook/react";
import { fn } from "@storybook/test";
import { Fragment } from "react";

import { Box, Stack } from "metabase/ui";
import {
  StoryJsx,
  StoryLabel,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

import { SelectButton, type SelectButtonProps } from "./SelectButton";

export default {
  title: "Components/Ask Before Using/SelectButton",
  component: SelectButton,
  args: {
    onClick: fn(),
  },
};

const Template: StoryFn<SelectButtonProps> = (args) => {
  return <SelectButton {...args} />;
};

export const Default = {
  render: Template,

  args: {
    children: "Select an option",
    hasValue: false,
    fullWidth: false,
  },
};

export const WithValue = {
  render: Template,

  args: {
    children: "Some value is selected",
    hasValue: true,
    fullWidth: false,
  },
};

export const Disabled = {
  render: Template,

  args: {
    children: "Select an option",
    hasValue: false,
    fullWidth: false,
    disabled: true,
  },
};

export const WithClearBehavior = {
  render: Template,

  args: {
    children: "Some value is selected",
    hasValue: true,
    fullWidth: false,
    disabled: false,
    onClear: fn(),
  },
};

const FIELD_WIDTH = "14rem";
const LABEL_WIDTH = "5rem";

type Example = {
  id: string;
  jsx: string;
  label: string;
  props: Partial<SelectButtonProps>;
};

const COLUMNS: Example[] = [
  {
    id: "empty",
    jsx: "<SelectButton hasValue={false} />",
    label: "Select an option",
    props: { hasValue: false },
  },
  {
    id: "value",
    jsx: "<SelectButton hasValue />",
    label: "Some value is selected",
    props: { hasValue: true },
  },
  {
    id: "clear",
    jsx: "<SelectButton onClear={fn} />",
    label: "Some value is selected",
    props: { hasValue: true, onClear: fn() },
  },
];

const STATES: {
  id: string;
  label: string;
  props: Partial<SelectButtonProps>;
}[] = [
  { id: "default", label: "Default", props: {} },
  { id: "focus", label: "Focused", props: {} },
  { id: "disabled", label: "Disabled", props: { disabled: true } },
];

const WIDTH_EXAMPLES: Example[] = [
  {
    id: "auto",
    jsx: "<SelectButton fullWidth={false} />",
    label: "None",
    props: { fullWidth: false },
  },
  {
    id: "full",
    jsx: "<SelectButton />",
    label: "Pick a dashboard",
    props: {},
  },
  {
    id: "truncated",
    jsx: "<SelectButton />",
    label: "A value far too long to fit in the field",
    props: {},
  },
];

const OverviewTemplate: StoryFn = () => (
  <StoryShowcase title="SelectButton">
    <StorySection
      title="Values and states"
      description="The clear button takes the place of the chevron, and is hidden while the field is disabled."
    >
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: `${LABEL_WIDTH} repeat(${COLUMNS.length}, max-content)`,
          columnGap: "2.5rem",
          rowGap: "1rem",
          alignItems: "center",
        }}
      >
        <div />
        {COLUMNS.map(({ id, jsx }) => (
          <StoryJsx key={id}>{jsx}</StoryJsx>
        ))}
        {STATES.map((state) => (
          <Fragment key={state.id}>
            <StoryLabel>{state.label}</StoryLabel>
            {COLUMNS.map((column) => (
              <SelectButton
                key={column.id}
                data-state-row={state.id}
                fullWidth={false}
                style={{ width: FIELD_WIDTH }}
                {...column.props}
                {...state.props}
              >
                {column.label}
              </SelectButton>
            ))}
          </Fragment>
        ))}
      </Box>
    </StorySection>

    <StorySection
      title="Width"
      description="A full-width field fills its container and cuts off a value that does not fit. Without it, the field is as wide as its content, down to a minimum."
    >
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${WIDTH_EXAMPLES.length}, minmax(${FIELD_WIDTH}, max-content))`,
          columnGap: "2.5rem",
        }}
      >
        {WIDTH_EXAMPLES.map(({ id, jsx, label, props }) => (
          <Stack key={id} gap="lg" align="start">
            <StoryJsx>{jsx}</StoryJsx>
            <Box w={FIELD_WIDTH}>
              <SelectButton {...props}>{label}</SelectButton>
            </Box>
          </Stack>
        ))}
      </Box>
    </StorySection>
  </StoryShowcase>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: { focusWithin: ['button[data-state-row="focus"]'] },
    controls: { include: ["theme"] },
  },
};
