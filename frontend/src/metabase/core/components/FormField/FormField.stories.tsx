import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";
import type { ComponentProps } from "react";
import { isValidElement, cloneElement } from "react";

import Toggle from "../Toggle/Toggle";

import FormField from "./FormField";

export default {
  title: "Core/FormField",
  component: FormField,
};

type inputProps = {
  value: unknown;
  onChange: (value: unknown) => void;
};

const Template: ComponentStory<typeof FormField> = ({
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

export const ToggleStory = Template.bind({});
ToggleStory.storyName = "Toggle";
ToggleStory.args = {
  children: <Toggle />,
};

export const ToggleWithTitle = Template.bind({});
ToggleWithTitle.args = {
  children: <Toggle />,
  title: "Toggle this value?",
  infoTooltip: "Info tooltip",
};

export const ToggleWithInlineTitle = Template.bind({});
ToggleWithInlineTitle.args = {
  children: <Toggle />,
  title: "Toggle this value?",
  orientation: "horizontal",
  infoTooltip: "Info tooltip",
};
