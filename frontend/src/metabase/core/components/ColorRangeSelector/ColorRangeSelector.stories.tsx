import { useArgs } from "@storybook/addons";
import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";

import ColorRangeSelector from "./ColorRangeSelector";

export default {
  title: "Core/ColorRangeSelector",
  component: ColorRangeSelector,
};

const Template: ComponentStory<typeof ColorRangeSelector> = args => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value: string[]) => {
    updateArgs({ value });
  };

  return <ColorRangeSelector {...args} value={value} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  value: [color("white"), color("brand")],
  colors: [color("brand"), color("summarize"), color("filter")],
};

export const WithColorRanges = Template.bind({});
WithColorRanges.args = {
  value: [color("white"), color("brand")],
  colors: [color("brand"), color("summarize"), color("filter")],
  colorRanges: [
    [color("error"), color("white"), color("success")],
    [color("error"), color("warning"), color("success")],
  ],
};

export const WithColorMapping = Template.bind({});
WithColorMapping.args = {
  value: [color("white"), color("brand")],
  colors: [color("brand"), color("summarize"), color("filter")],
  colorMapping: {
    [color("brand")]: [color("brand"), color("white"), color("brand")],
    [color("summarize")]: [color("summarize"), color("white"), color("error")],
    [color("filter")]: [color("filter"), color("white"), color("filter")],
  },
};
