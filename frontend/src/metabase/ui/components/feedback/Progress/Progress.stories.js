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

const DefaultTemplate = args => <Progress {...args} />;
const Default = DefaultTemplate.bind({});

export default {
  title: "Feedback/Progress",
  component: Progress,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};
