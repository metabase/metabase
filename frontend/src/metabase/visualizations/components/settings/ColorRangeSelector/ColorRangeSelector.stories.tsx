import { useArgs } from "@storybook/preview-api";
import type { StoryFn } from "@storybook/react";

import { color } from "metabase/ui/colors";

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
    value: [color("core-white"), color("core-brand")],
    colors: [
      color("core-brand"),
      color("core-summarize"),
      color("core-filter"),
    ],
  },
};

export const WithColorRanges = {
  render: Template,

  args: {
    value: [color("core-white"), color("core-brand")],
    colors: [
      color("core-brand"),
      color("core-summarize"),
      color("core-filter"),
    ],
    colorRanges: [
      [
        color("feedback-negative"),
        color("core-white"),
        color("feedback-positive"),
      ],
      [
        color("feedback-negative"),
        color("feedback-warning"),
        color("feedback-positive"),
      ],
    ],
  },
};

export const WithColorMapping = {
  render: Template,

  args: {
    value: [color("core-white"), color("core-brand")],
    colors: [
      color("core-brand"),
      color("core-summarize"),
      color("core-filter"),
    ],
    colorMapping: {
      [color("core-brand")]: [
        color("core-brand"),
        color("core-white"),
        color("core-brand"),
      ],
      [color("core-summarize")]: [
        color("core-summarize"),
        color("core-white"),
        color("feedback-negative"),
      ],
      [color("core-filter")]: [
        color("core-filter"),
        color("core-white"),
        color("core-filter"),
      ],
    },
  },
};
