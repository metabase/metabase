import type { StoryFn } from "@storybook/react";

import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { color } from "metabase/ui/colors";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import {
  type StaticChartProps,
  StaticVisualization,
} from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "Viz/Static Viz/TreemapChart",
  component: StaticVisualization,
};

const Template: StoryFn<StaticChartProps> = (args) => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <StaticVisualization {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const TwoLevel = {
  render: Template,
  args: {
    rawSeries: data.twoLevel,
    renderingContext,
  },
};

export const OneLevel = {
  render: Template,
  args: {
    rawSeries: data.oneLevel,
    renderingContext,
  },
};

export const Watermark = {
  render: Template,
  args: {
    rawSeries: data.twoLevel,
    renderingContext,
    hasDevWatermark: true,
  },
};
