import type { StoryFn } from "@storybook/react";
import { useState } from "react";

import { NumericInput } from "./NumericInput";

export default {
  title: "Components/Ask Before Using/NumericInput",
  component: NumericInput,
};

const Template: StoryFn<typeof NumericInput> = (args) => {
  const [value, setValue] = useState<number>();
  return <NumericInput {...args} value={value} onChange={setValue} />;
};

export const Default = {
  render: Template,
};
