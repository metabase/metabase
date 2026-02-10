import type { StoryFn } from "@storybook/react-webpack5";
import type { ComponentProps } from "react";
import { cloneElement, isValidElement } from "react";
import { useArgs } from "storybook/preview-api";

import { Toggle } from "../Toggle/Toggle";

import { FormField } from "./FormField";

export default {
  title: "Components/Ask Before Using/FormField",
  component: FormField,
};

type inputProps = {
  value: unknown;
  onChange: (value: unknown) => void;
};

const Template: StoryFn<typeof FormField> = ({
  children,
  ...args
}: ComponentProps<typeof FormField>) => {
  const [{ value }, updateArgs] = useArgs();
  const handleChange = (value: unknown) => updateArgs({ value });

  return (
    <div style={{ maxWidth: 400 }}>
      <FormField {...args}>
        {isValidElement<inputProps>(children) &&
          cloneElement(children, {
            value,
            onChange: handleChange,
          })}
      </FormField>
    </div>
  );
};

export const ToggleStory = {
  render: Template,
  name: "Toggle",

  args: {
    children: <Toggle />,
  },
};

export const ToggleWithTitle = {
  render: Template,

  args: {
    children: <Toggle />,
    title: "Toggle this value?",
    infoTooltip: "Info tooltip",
  },
};

export const ToggleWithInlineTitle = {
  render: Template,

  args: {
    children: <Toggle />,
    title: "Toggle this value?",
    orientation: "horizontal",
    infoTooltip: "Info tooltip",
  },
};
