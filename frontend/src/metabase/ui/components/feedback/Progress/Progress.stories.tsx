import { Progress } from "./";

const args = {
  value: 40,
};

const argTypes = {
  size: {
    options: ["xs", "sm", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
};

export default {
  title: "Feedback/Progress",
  component: Progress,
  args,
  argTypes,
};

export const Default = {};
