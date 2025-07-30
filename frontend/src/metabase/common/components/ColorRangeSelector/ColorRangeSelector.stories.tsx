import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";

import { color } from "metabase/lib/colors";

import {
  ColorRangeSelector,
  type ColorRangeSelectorProps,
} from "./ColorRangeSelector";

export default {
  title: "Components/Ask Before Using/ColorRangeSelector",
  component: ColorRangeSelector,
};

const Template: StoryFn<ColorRangeSelectorProps> = (args) => {
  const [{ value }, updateArgs] = useArgs();

  const handleChange = (value: string[]) => {
    updateArgs({ value });
  };

  return <ColorRangeSelector {...args} value={value} onChange={handleChange} />;
};

export const Default = {
  render: Template,

  args: {
    value: [color("white"), color("brand")],
    colors: [color("brand"), color("summarize"), color("filter")],
  },
};

export const WithColorRanges = {
  render: Template,

  args: {
    value: [color("white"), color("brand")],
    colors: [color("brand"), color("summarize"), color("filter")],
    colorRanges: [
      [color("error"), color("white"), color("success")],
      [color("error"), color("warning"), color("success")],
    ],
  },
};

export const WithColorMapping = {
  render: Template,

  args: {
    value: [color("white"), color("brand")],
    colors: [color("brand"), color("summarize"), color("filter")],
    colorMapping: {
      [color("brand")]: [color("brand"), color("white"), color("brand")],
      [color("summarize")]: [
        color("summarize"),
        color("white"),
        color("error"),
      ],
      [color("filter")]: [color("filter"), color("white"), color("filter")],
    },
  },
};
