import type { ComponentStory } from "@storybook/react";
import { DatePicker } from "./DatePicker";

export default {
  title: "Common/DatePicker",
  component: DatePicker,
};

const Template: ComponentStory<typeof DatePicker> = args => {
  return <DatePicker {...args} onChange={() => undefined} />;
};

export const Default = Template.bind({});
