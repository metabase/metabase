import type { ComponentStory } from "@storybook/react";
import { useState } from "react";

import NumericInput from "./NumericInput";

export default {
  title: "Core/NumericInput",
  component: NumericInput,
};

const Template: ComponentStory<typeof NumericInput> = args => {
  const [value, setValue] = useState<number>();
  return <NumericInput {...args} value={value} onChange={setValue} />;
};

export const Default = Template.bind({});
