import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import { DateQuarterYearWidget } from "./DateQuarterYearWidget";

export default {
  title: "Parameters/DateQuarterYearWidget",
  component: DateQuarterYearWidget,
};

const Template: ComponentStory<typeof DateQuarterYearWidget> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleSetValue = (v: string) => {
    updateArgs({ value: v });
  };

  const handleClose = () => {
    // do nothing
  };

  return (
    <DateQuarterYearWidget
      {...args}
      value={value}
      setValue={handleSetValue}
      onClose={handleClose}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  value: "",
};

export const SomeTimeLastYear = Template.bind({});
SomeTimeLastYear.args = {
  value: "4-2021",
};

export const SomeTimeAgo = Template.bind({});
SomeTimeAgo.args = {
  value: "2-1981",
};
