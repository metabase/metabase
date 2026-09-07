import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, PasswordInput, type PasswordInputProps, Text } from "metabase/ui";
import { StoryJsx, StoryShowcase } from "metabase/ui/stories/showcase";

const args = {
  label: "Password",
  placeholder: "Enter your password",
  description: undefined,
  error: undefined,
  disabled: false,
};

const argTypes = {
  label: {
    control: { type: "text" },
  },
  placeholder: {
    control: { type: "text" },
  },
  description: {
    control: { type: "text" },
  },
  error: {
    control: { type: "text" },
  },
  disabled: {
    control: { type: "boolean" },
  },
  size: {
    options: ["sm", "md", "lg"],
    control: { type: "inline-radio" },
  },
};

export default {
  title: "Components/Inputs/PasswordInput",
  component: PasswordInput,
  args,
  argTypes,
};

const Template: StoryFn<PasswordInputProps> = (args) => (
  <PasswordInput {...args} />
);

export const Default = {
  render: Template,
};

const SIZES = ["sm", "md", "lg"] as const;

const ERROR_MESSAGE = "Required field";
const FILLED_VALUE = "hunter2";

const STATES = [
  { id: "default-empty", label: "Default, empty", props: {} },
  {
    id: "default-filled",
    label: "Default, filled",
    props: { defaultValue: FILLED_VALUE },
  },
  { id: "focused-empty", label: "Focused, empty", props: {}, focus: true },
  {
    id: "focused-filled",
    label: "Focused, filled",
    props: { defaultValue: FILLED_VALUE },
    focus: true,
  },
  {
    id: "error-empty",
    label: "Error, empty",
    props: { error: ERROR_MESSAGE },
  },
  {
    id: "error-filled",
    label: "Error, filled",
    props: { error: ERROR_MESSAGE, defaultValue: FILLED_VALUE },
  },
  {
    id: "error-focused-empty",
    label: "Error + Focused, empty",
    props: { error: ERROR_MESSAGE },
    focus: true,
  },
  {
    id: "error-focused-filled",
    label: "Error + Focused, filled",
    props: { error: ERROR_MESSAGE, defaultValue: FILLED_VALUE },
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
    props: { disabled: true, defaultValue: FILLED_VALUE },
  },
] satisfies {
  id: string;
  label: string;
  props: Partial<PasswordInputProps>;
  focus?: boolean;
}[];

// Forces the "Focused" rows via storybook-addon-pseudo-states. Currently, a
// no-op visually: PasswordInput.module.css has no focus-specific styling yet,
// so this accurately reflects the component's current, pre-restyle behavior.
const focusSelector = (id: string) => `[data-state-row="${id}"]`;

const OverviewTemplate: StoryFn<PasswordInputProps> = () => (
  <StoryShowcase title="PasswordInput">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `14rem repeat(${SIZES.length}, max-content)`,
        columnGap: "2rem",
        rowGap: "1rem",
        alignItems: "center",
      }}
    >
      <div />
      {SIZES.map((size) => (
        <StoryJsx key={size}>{`<PasswordInput size="${size}" />`}</StoryJsx>
      ))}
      {STATES.map((state) => (
        <Fragment key={state.id}>
          <Text size="sm" c="text-secondary">
            {state.label}
          </Text>
          {SIZES.map((size) => (
            <Box key={`${state.id}-${size}`} w={256}>
              <PasswordInput
                data-state-row={state.id}
                label="Password"
                size={size}
                placeholder="Password"
                {...state.props}
              />
            </Box>
          ))}
        </Fragment>
      ))}
    </Box>
  </StoryShowcase>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      focus: STATES.filter((state) => state.focus).map((state) =>
        focusSelector(state.id),
      ),
    },
    controls: { include: ["theme"] },
  },
};
