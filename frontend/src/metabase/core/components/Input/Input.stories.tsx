import type { ComponentStory } from "@storybook/react";
import { useState } from "react";

import Input from "./Input";

export default {
  title: "Core/Input",
  component: Input,
};

const UncontrolledTemplate: ComponentStory<typeof Input> = args => {
  return <Input {...args} />;
};

const ControlledTemplate: ComponentStory<typeof Input> = args => {
  const [value, setValue] = useState("");
  return (
    <Input
      {...args}
      value={value}
      onChange={e => setValue(e.target.value)}
      onResetClick={() => setValue("")}
    />
  );
};

export const Default = UncontrolledTemplate.bind({});

export const WithError = UncontrolledTemplate.bind({});
WithError.args = {
  error: true,
};

export const WithRightIcon = UncontrolledTemplate.bind({});
WithRightIcon.args = {
  rightIcon: "info",
  rightIconTooltip: "Useful tips",
};

export const Controlled = ControlledTemplate.bind({});
