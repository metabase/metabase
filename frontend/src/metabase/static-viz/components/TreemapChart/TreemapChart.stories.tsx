import type { StoryFn } from "@storybook/react";

import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { color } from "metabase/ui/colors";
import { data } from "metabase/visualizations/visualizations/TreemapChart/stories-data";
import {
  DEFAULT_VISUALIZATION_THEME,
  type RenderingContext,
} from "metabase/viz-core";

import {
  type StaticChartProps,
  StaticVisualization,
} from "../StaticVisualization";

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

export const GridCellWideShort = {
  render: Template,
  args: {
    rawSeries: data.twoLevel,
    renderingContext,
    width: 1200,
    height: 320,
    fitWithinBounds: true,
  },
};
