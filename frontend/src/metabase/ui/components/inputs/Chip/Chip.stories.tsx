import type { StoryFn } from "@storybook/react-webpack5";

import { Chip, type ChipProps } from "metabase/ui";

const argTypes = {
  size: {
    options: ["xs", "sm", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
};

export default {
  title: "Components/Ask Before Using/Chip",
  component: Chip,
  args: {
    size: "md",
    children: "Text",
  },
  argTypes,
};

const Template: StoryFn<ChipProps> = (args) => {
  return <Chip {...args} />;
};

export const Default = {
  render: Template,
};
