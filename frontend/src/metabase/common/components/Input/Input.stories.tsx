import type { StoryFn } from "@storybook/react";
import { useState } from "react";

import { Input, type InputProps } from "./Input";

export default {
  title: "Deprecated/Components/Input",
  component: Input,
};

const UncontrolledTemplate: StoryFn<InputProps> = (args) => {
  return <Input {...args} />;
};

const ControlledTemplate: StoryFn<typeof Input> = (args) => {
  const [value, setValue] = useState("");
  return (
    <Input
      {...args}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onResetClick={() => setValue("")}
    />
  );
};

export const Default = {
  render: UncontrolledTemplate,
};

export const WithError = {
  render: UncontrolledTemplate,

  args: {
    error: true,
  },
};

export const WithRightIcon = {
  render: UncontrolledTemplate,

  args: {
    rightIcon: "info",
    rightIconTooltip: "Useful tips",
  },
};

export const Controlled = {
  render: ControlledTemplate,
};
